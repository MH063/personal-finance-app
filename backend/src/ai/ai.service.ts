import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as natural from 'natural';
import * as ss from 'simple-statistics';
import * as fs from 'fs';
import * as path from 'path';
import { Ollama } from 'ollama';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { Debt, DebtStatus } from '../entities/debt.entity';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private classifier: natural.BayesClassifier;
  private ollama: Ollama;
  private hasLocalLLM = false;
  private readonly MODEL_DIR = path.join(process.cwd(), 'storage', 'ai-models');
  private readonly MODEL_FILE = path.join(this.MODEL_DIR, 'classifier.json');
  private readonly META_FILE = path.join(this.MODEL_DIR, 'metadata.json');
  private readonly RETRAIN_THRESHOLD = 10; // 新增多少条数据触发重训
  private readonly LLM_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:1.8b';
  private readonly PULL_TIMEOUT_MS = Number.isFinite(
    parseInt(String(process.env.OLLAMA_PULL_TIMEOUT_MS || ''), 10),
  )
    ? parseInt(String(process.env.OLLAMA_PULL_TIMEOUT_MS), 10)
    : 30000;
  private pullingModel = false;

  private serviceStatus: {
    state: 'idle' | 'downloading' | 'ready' | 'error';
    progress?: number;
    message?: string;
  } = { state: 'idle' };

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Debt)
    private readonly debtRepository: Repository<Debt>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {
    this.classifier = new natural.BayesClassifier();
    this.ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
    this.ensureModelDir();
  }

  private ensureModelDir() {
    if (!fs.existsSync(this.MODEL_DIR)) {
      fs.mkdirSync(this.MODEL_DIR, { recursive: true });
    }
  }

  async onModuleInit() {
    this.logger.log('[AiService] 初始化中...');

    // 初始化本地分类器
    const loaded = await this.loadModel();
    if (loaded) {
      this.logger.log('[AiService] 已加载本地模型，检查增量更新...');
      await this.trainClassifier(loaded.count);
    } else {
      this.logger.log('[AiService] 无本地模型，开始全量训练...');
      await this.trainClassifier();
    }

    // 检查 Local LLM 连接
    this.checkLocalLLM();

    this.logger.log('[AiService] 初始化完成，分类器已就绪');
  }

  /**
   * 获取服务状态
   */
  getServiceStatus() {
    return {
      ...this.serviceStatus,
      hasLocalLLM: this.hasLocalLLM,
      model: this.LLM_MODEL,
    };
  }

  /**
   * 检查本地 LLM 服务状态
   */
  private async checkLocalLLM() {
    try {
      await this.ollama.list();
      this.hasLocalLLM = true;
      if (
        this.serviceStatus.state === 'error' &&
        this.serviceStatus.message?.includes('Disconnected')
      ) {
        this.serviceStatus = { state: 'ready' };
      }
      this.logger.log('[AiService] Local LLM 服务已连接');
    } catch (_error) {
      this.hasLocalLLM = false;
      // 只有在不是下载中的时候才更新为错误状态
      if (this.serviceStatus.state !== 'downloading') {
        this.serviceStatus = { state: 'error', message: 'Local LLM Disconnected' };
      }
      this.logger.warn('[AiService] Local LLM 服务未连接，将使用基础规则模式');
    }
  }

  /**
   * 确认目标模型是否可用，不可用则尝试拉取
   */
  private async ensureModelReady(): Promise<{
    available: boolean;
    reason?: string;
    detail?: string;
  }> {
    try {
      const list = await this.ollama.list();
      const models = Array.isArray((list as any)?.models)
        ? (list as any).models
        : Array.isArray(list)
          ? list
          : [];
      const names = models
        .map((m: any) => (typeof m === 'string' ? m : m.name || m.model))
        .filter(Boolean);
      const requested = this.LLM_MODEL;
      const found = names.some((n: string) => n === requested);
      if (found) {
        this.serviceStatus = { state: 'ready' };
        return { available: true };
      }
      this.logger.warn(`[AiService] 模型未找到，异步拉取: ${this.LLM_MODEL}`);
      this.serviceStatus = { state: 'downloading', progress: 0, message: 'Starting download...' };
      if (!this.pullingModel) {
        this.pullingModel = true;
        this.startModelPullInBackground().catch((err) => {
          this.logger.error('[AiService] 背景拉取失败:', err);
          // 区分 TLS 握手超时等网络错误，不强制设为 error 状态，允许继续尝试或使用快速模式
          const errMsg = String(err?.message || err);
          if (errMsg.includes('TLS handshake timeout') || errMsg.includes('timeout')) {
            this.serviceStatus = {
              state: 'error',
              message:
                '模型拉取超时 (TLS timeout)，请检查网络或稍后重试。系统已自动切换至快速模式。',
            };
          } else {
            this.serviceStatus = { state: 'error', message: errMsg };
          }
          this.pullingModel = false;
        });
      }
      return { available: false, reason: 'MODEL_PULLING', detail: 'Started in background' };
    } catch (err: any) {
      this.logger.error('[AiService] 查询模型列表失败:', err);
      return { available: false, reason: 'LLM_LIST_FAILED', detail: String(err?.message || err) };
    }
  }

  private async startModelPullInBackground() {
    const startedAt = Date.now();
    try {
      const stream = await (this.ollama as any).pull({ model: this.LLM_MODEL, stream: true });
      for await (const part of stream) {
        if (part.total && part.completed) {
          const progress = Math.floor((part.completed / part.total) * 100);
          this.serviceStatus = { state: 'downloading', progress, message: part.status };
        }
        if (
          Date.now() - startedAt > this.PULL_TIMEOUT_MS &&
          this.serviceStatus.state === 'downloading'
        ) {
          this.serviceStatus = { state: 'ready', message: 'Fast mode active, model pulling' };
        }
      }
      this.logger.log(`[AiService] 模型拉取完成: ${this.LLM_MODEL}`);
      this.serviceStatus = { state: 'ready' };
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      this.logger.error('[AiService] 模型拉取失败(背景):', err);

      if (errMsg.includes('TLS handshake timeout') || errMsg.includes('timeout')) {
        this.serviceStatus = {
          state: 'error',
          message:
            '网络连接超时 (TLS timeout)，无法从 Ollama 仓库下载模型。请检查网络或稍后重试。系统已启用快速模式。',
        };
      } else if (errMsg.includes('pull model manifest') || errMsg.includes('manifest')) {
        // 模型清单缺失或不可用时，切换到快速模式并标记为就绪，避免前端持续错误状态
        this.serviceStatus = {
          state: 'ready',
          message: '快速模式已启用：模型清单缺失或不可用 (' + errMsg + ')',
        };
      } else {
        // 其他错误同样切换至快速模式以保障可用性
        this.serviceStatus = {
          state: 'ready',
          message: '快速模式已启用：模型拉取失败 (' + errMsg + ')',
        };
      }
    } finally {
      this.pullingModel = false;
    }
  }

  /**
   * 自然语言查账 (Text-to-SQL)
   * 将用户中文查询转换为 PostgreSQL 可执行的 SQL，并返回总结答案
   * @param query 用户自然语言查询
   * @param userId 用户ID（强制作用于 WHERE 条件）
   */
  /**
   * 自然语言查账 (Text-to-SQL，严格PG语法)
   * @param query 用户查询文本
   * @param userId 当前用户ID
   * @param opts 分页与限制选项与快速模式
   */
  async naturalLanguageQuery(
    query: string,
    userId: string,
    opts?: { page?: number; limit?: number; fastMode?: boolean },
  ) {
    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.max(1, Math.min(1000, opts?.limit ?? 50));
    const offset = (page - 1) * limit;
    let paramsForSql: any[] = [];
    const fastMode = !!opts?.fastMode;
    let nlqVersion = 0;
    try {
      const v = await this.redis.get(`ai:cache:nlq:version:${userId}`);
      nlqVersion = Number.isFinite(parseInt(String(v || '0'), 10))
        ? parseInt(String(v || '0'), 10)
        : 0;
    } catch {}
    // 多轮对话上下文注入
    let effectiveQuery = query;
    try {
      const isFollowUp =
        query.length < 10 &&
        (/那|再|还是|那(么|个)?/.test(query) ||
          /^(上月|本月|今年|去年|餐饮|交通|购物|娱乐)$/.test(query));
      if (isFollowUp) {
        const lastContextRaw = await this.redis.get(`ai:context:last_query:${userId}`);
        if (lastContextRaw) {
          const lastContext = JSON.parse(lastContextRaw);
          effectiveQuery = `(上下文: ${lastContext.query}) ${query}`;
          this.logger.log(`[AiService] 检测到后续提问，注入上下文: ${effectiveQuery}`);
        }
      }
    } catch (ctxErr) {
      this.logger.warn('[AiService] 获取上下文失败:', ctxErr);
    }

    const cacheKey = this.buildNlqCacheKey(
      effectiveQuery,
      userId,
      { page, limit, fastMode },
      nlqVersion,
    );
    // 帮助/能力意图优先
    {
      const q = (effectiveQuery || '').replace(/\s+/g, '');
      const wantsHelp =
        /你能干啥|能干啥|可以做什么|你会做什么|帮助|功能|指令|怎么用|help|usage|你能帮我做什么|能做什么|做什么/i.test(
          q,
        );
      const isGeneralGreeting = /你好|您好|在吗|嘿|hi|hello/i.test(q);
      const isIdentityQuery = /你是谁|你叫什么|你是AI吗|谁开发的/i.test(q);

      if (wantsHelp || isGeneralGreeting || isIdentityQuery) {
        let answer = '';
        if (isGeneralGreeting) {
          answer = '你好！我是您的 AI 财务助手，很高兴为您服务。';
        } else if (isIdentityQuery) {
          answer = '我是您的个人 AI 财务助手，基于本地大模型为您提供私密的财务数据分析服务。';
        } else {
          answer = [
            '我可以帮你：',
            '1. 自然语言查账（明细、合计、分类统计、最近7天/本月/上月等时间范围）',
            '2. 账本列表与交易账本相关查询',
            '3. AI 分类预测与财务健康分析、支出趋势与异常预警',
            '4. CSV 导入与批量记账（前端）',
            '你可以问我：',
            '“本月餐饮花了多少？”、“最近7天的支出明细”、“现在存在哪些账本？”、“各分类支出排行”',
          ].join('\n');
        }
        const payload = {
          success: true,
          answer,
          debug: { help: true, page, limit, offset, fastMode },
        };
        try {
          await this.redis.set(cacheKey, JSON.stringify(payload), 'EX', 24 * 60 * 60);
        } catch {}
        return payload;
      }
    }
    // 账本意图优先（缓存读取前）
    {
      const ledgerIntentPre = /账本|帐本|账簿|账册|账目/.test(
        (effectiveQuery || '').replace(/\s+/g, ''),
      );
      if (ledgerIntentPre) {
        const ledgerSql =
          'select l.id, l.name, l.type, l.is_default, l.created_at from ledgers l join ledger_members lm on lm.ledger_id = l.id where lm.user_id = $1 order by l.created_at asc';
        {
          const startLedger = Date.now();
          let rows: any[] = [];
          const queryRunner = this.transactionRepository.manager.connection.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.startTransaction();
          try {
            await queryRunner.query('SET TRANSACTION READ ONLY');
            rows = await queryRunner.query(ledgerSql, [userId]);
            await queryRunner.commitTransaction();
          } catch (execErr: any) {
            await queryRunner.rollbackTransaction();
            this.logger.error('[AiService] 账本列表 SQL 执行失败:', execErr);
            return {
              success: false,
              message: '账本列表查询失败，请稍后重试',
              reason: 'LEDGER_SQL_EXECUTION_ERROR',
              debug: { sql: ledgerSql, error: String(execErr?.message || execErr) },
            };
          } finally {
            await queryRunner.release();
          }
          const duration = Date.now() - startLedger;
          const answer = this.buildQuickSummary(effectiveQuery, rows);
          const payload = {
            success: true,
            answer,
            debug: {
              sql: ledgerSql,
              rawResult: rows,
              page,
              limit,
              offset,
              duration,
              fastMode,
            },
          };
          try {
            await this.redis.set(cacheKey, JSON.stringify(payload), 'EX', 24 * 60 * 60);
          } catch {}
          return payload;
        }
      }
    }
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.log(`[AiService] NLQ 缓存命中: key=${cacheKey}`);
        const payload = JSON.parse(cached);
        return payload;
      }
    } catch (cacheErr: any) {
      this.logger.warn('[AiService] 读取 NLQ 缓存失败，继续执行:', cacheErr?.message || cacheErr);
    }

    try {
      if (!effectiveQuery || effectiveQuery.trim().length === 0) {
        return {
          success: false,
          message: '查询条件为空',
          reason: 'EMPTY_QUERY',
        };
      }
      // 快速模式：优先使用规则回退直接生成 SQL 并返回快速总结
      if (fastMode) {
        const fbFast = await this.buildFallbackSql(effectiveQuery, userId);
        if (fbFast) {
          const startFast = Date.now();
          let fastResult: any[] = [];
          const queryRunner = this.transactionRepository.manager.connection.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.startTransaction();
          try {
            await queryRunner.query('SET TRANSACTION READ ONLY');
            fastResult = await queryRunner.query(fbFast.sql, fbFast.params);
            await queryRunner.commitTransaction();
          } catch (execErr: any) {
            await queryRunner.rollbackTransaction();
            this.logger.error('[AiService] 快速模式 SQL 执行失败:', execErr);
            return {
              success: false,
              message: 'SQL 执行失败，请检查表结构与语法',
              reason: 'SQL_EXECUTION_ERROR',
              debug: { sql: fbFast.sql, error: String(execErr?.message || execErr) },
            };
          } finally {
            await queryRunner.release();
          }
          const duration = Date.now() - startFast;
          let quickSummary = this.buildQuickSummary(effectiveQuery, fastResult);
          const wantsLedgerByQuery = /账本|账簿|帐本|账|帐/.test(
            (effectiveQuery || '').replace(/\s+/g, ''),
          );
          if (
            wantsLedgerByQuery &&
            !(fastResult[0] && 'id' in fastResult[0] && 'name' in fastResult[0])
          ) {
            try {
              const ledgerSql =
                'select l.id, l.name, l.type, l.is_default, l.created_at from ledgers l join ledger_members lm on lm.ledger_id = l.id where lm.user_id = $1 order by l.created_at asc';
              const rows = await this.transactionRepository.query(ledgerSql, [userId]);
              quickSummary = this.buildQuickSummary(effectiveQuery, rows);
              fastResult = rows;
            } catch (err) {
              const e: any = err as any;
              this.logger.warn('[AiService] 回退账本列表查询失败:', e?.message || e);
            }
          }
          const payload = {
            success: true,
            answer: quickSummary,
            debug: {
              sql: fbFast.sql,
              rawResult: fastResult,
              page,
              limit,
              offset,
              duration,
              fastMode: true,
            },
          };
          try {
            await this.redis.set(cacheKey, JSON.stringify(payload), 'EX', 24 * 60 * 60);
          } catch {}
          return payload;
        }
      }

      // 惰性检查连接状态（仅在需要使用 LLM 时进行）
      // 仅当未命中快速回退或未启用快速模式时，才检查/要求 LLM 可用
      // 确认模型是否就绪（非快速模式或快速模式未命中规则）
      const modelReady = await this.ensureModelReady();
      if (!modelReady.available) {
        const fbFast = await this.buildFallbackSql(effectiveQuery, userId);
        if (fbFast) {
          const startFast = Date.now();
          let fastResult: any[] = [];
          const queryRunner = this.transactionRepository.manager.connection.createQueryRunner();
          await queryRunner.connect();
          await queryRunner.startTransaction();
          try {
            await queryRunner.query('SET TRANSACTION READ ONLY');
            fastResult = await queryRunner.query(fbFast.sql, fbFast.params);
            await queryRunner.commitTransaction();
          } catch (execErr: any) {
            await queryRunner.rollbackTransaction();
            this.logger.error('[AiService] 模型不可用时快速回退执行失败:', execErr);
            return {
              success: false,
              message: '模型未就绪或拉取失败',
              reason: modelReady.reason || 'MODEL_NOT_AVAILABLE',
              debug: { detail: modelReady.detail, error: String(execErr?.message || execErr) },
            };
          } finally {
            await queryRunner.release();
          }
          const duration = Date.now() - startFast;
          const quickSummary = this.buildQuickSummary(effectiveQuery, fastResult);
          const payload = {
            success: true,
            answer: quickSummary,
            debug: {
              sql: fbFast.sql,
              rawResult: fastResult,
              page,
              limit,
              offset,
              duration,
              fastMode: true,
              reason: modelReady.reason || 'MODEL_NOT_AVAILABLE_FAST_FALLBACK',
            },
          };
          try {
            await this.redis.set(cacheKey, JSON.stringify(payload), 'EX', 24 * 60 * 60);
          } catch {}
          return payload;
        }
        return {
          success: false,
          message: '模型未就绪或拉取失败',
          reason: modelReady.reason || 'MODEL_NOT_AVAILABLE',
          debug: { detail: modelReady.detail },
        };
      }

      // 1. 获取 Schema 信息 (简化版)
      const categories = await this.categoryRepository.find({ select: ['id', 'name'] });
      const categoryMap = categories.map((c) => `${c.name}(id:${c.id})`).join(', ');

      // 2. 构建 Prompt（匹配真实 PostgreSQL/实体表结构）
      const prompt = this.buildPrompt(effectiveQuery, userId, categoryMap);

      // 3. 调用 LLM 生成 SQL
      let sql = '';
      let rawText = '';
      try {
        const response = await this.ollama.generate({
          model: this.LLM_MODEL,
          prompt: prompt,
          stream: false,
          options: {
            num_ctx: fastMode ? 2048 : 4096,
            temperature: 0.0,
          },
        });
        rawText = response.response || '';
        const cleaned = rawText.trim().replace(/```sql|```/g, '');
        // 提取首个有效 SELECT（支持 WITH 起始）
        const selectRegex =
          /(?:^|\n|\r)\s*((with[\s\S]*?select[\s\S]*?)|(select[\s\S]*?))(;|\s*$)/i;
        const match = cleaned.match(selectRegex);
        sql = match ? (match[1] || '').trim() : '';
      } catch (genErr: any) {
        this.logger.error('[AiService] LLM 生成 SQL 失败:', genErr);
        return {
          success: false,
          message: '模型生成失败，请稍后重试',
          reason: 'LLM_GENERATE_ERROR',
          debug: { error: String(genErr?.message || genErr) },
        };
      }

      const startAt = Date.now();
      this.logger.log(`[AiService] Generated SQL: ${sql}`);

      // 3.1 明细意图的早期覆盖处理（优先确保列表查询语义）
      {
        const intentTextEarly = (effectiveQuery || '').replace(/[\s，,。\.]/g, '');
        const wantsDetailEarly =
          /明细|列表|记录/.test(intentTextEarly) ||
          /前\d+条/.test(intentTextEarly) ||
          /明细|列表|记录|前\d+条/.test(effectiveQuery || '');
        this.logger.log(
          `[AiService] wantsDetailEarly=${wantsDetailEarly}, intentTextEarly=${intentTextEarly}`,
        );
        if (wantsDetailEarly) {
          const fbEarly = await this.buildFallbackSql(effectiveQuery, userId);
          if (fbEarly) {
            this.logger.log('[AiService] Early detail intent fallback applied.');
            sql = fbEarly.sql;
            paramsForSql = fbEarly.params;
          }
        }
      }
      // 4. 安全检查与严格重试
      const isSelectLike = /^\s*select\b/i.test(sql) || /^\s*with\b[\s\S]*?select\b/i.test(sql);
      if (!isSelectLike) {
        // 严格提示重试一次
        const strictPrompt = `
只输出一行以 SELECT 或 WITH 开头并包含 SELECT 的 PostgreSQL 查询语句，禁止任何多余文字或标点。
必须包含 user_id = '${userId}' 的过滤条件。
用户问题："${effectiveQuery}"
        `;
        try {
          const strictResp = await this.ollama.generate({
            model: this.LLM_MODEL,
            prompt: strictPrompt,
            stream: false,
            options: { num_ctx: 2048, temperature: 0.0 },
          });
          const strictText = (strictResp.response || '').trim().replace(/```sql|```/g, '');
          const selectRegex2 =
            /(?:^|\n|\r)\s*((with[\s\S]*?select[\s\S]*?)|(select[\s\S]*?))(;|\s*$)/i;
          const m2 = strictText.match(selectRegex2);
          sql = m2 ? (m2[1] || '').trim() : '';
        } catch (retryErr: any) {
          this.logger.error('[AiService] 严格重试生成 SQL 失败:', retryErr);
        }
      }

      const finallySelectLike =
        /^\s*select\b/i.test(sql) || /^\s*with\b[\s\S]*?select\b/i.test(sql);
      if (!finallySelectLike) {
        const fallbackSql = await this.buildFallbackSql(effectiveQuery, userId);
        if (!fallbackSql) {
          return {
            success: false,
            message: '生成的 SQL 非 SELECT 查询',
            reason: 'SQL_NOT_SELECT',
            debug: { rawText, sql },
          };
        }
        sql = fallbackSql.sql;
        paramsForSql = fallbackSql.params;
      }

      // 4.1 表约束检查：命中允许的表
      const referencesTransactions =
        /\bfrom\s+transactions\b/i.test(sql) || /\bjoin\s+transactions\b/i.test(sql);
      const referencesLedgers =
        /\bfrom\s+ledgers\b/i.test(sql) ||
        /\bjoin\s+ledgers\b/i.test(sql) ||
        /\bledger_members\b/i.test(sql);
      if (!referencesTransactions && !referencesLedgers) {
        const fb2 = await this.buildFallbackSql(effectiveQuery, userId);
        if (fb2) {
          sql = fb2.sql;
          paramsForSql = fb2.params;
        } else {
          return {
            success: false,
            message: 'SQL 未命中允许的表',
            reason: 'SQL_INVALID_TABLE',
            debug: { sql },
          };
        }
      }

      // 4.2 意图优先：对于包含“总额/合计/总计/分类统计”的查询，优先使用规则回退以保证时间范围与精确度
      const intentText = (effectiveQuery || '').replace(/[\s，,。\.]/g, '');
      const preferFallback =
        /总额|合计|总计/.test(intentText) ||
        (/(分类|各|每)/.test(intentText) && /(支出|收入)/.test(intentText));
      if (preferFallback) {
        const fb3 = await this.buildFallbackSql(effectiveQuery, userId);
        if (fb3) {
          sql = fb3.sql;
          paramsForSql = fb3.params;
        }
      }

      // 4.3 时间范围强制注入（如果用户意图包含但 SQL 未包含）
      const needThreeDays =
        /最近3天|近3天|三天|3天/.test(intentText) && !/transaction_date/i.test(sql);
      const needSevenDays =
        /最近7天|近7天|七天|7天/.test(intentText) && !/transaction_date/i.test(sql);
      const needThirtyDays =
        /最近30天|近30天|三十天|30天/.test(intentText) && !/transaction_date/i.test(sql);
      const needThreeMonths =
        /最近3月|近3月|三个月|3个月/.test(intentText) && !/transaction_date/i.test(sql);
      const needNinetyDays =
        /最近90天|近90天|九十天|90天/.test(intentText) && !/transaction_date/i.test(sql);
      const needThisMonth = /本月/.test(intentText) && !/date_trunc\('month'/.test(sql);
      const needLastMonth = /(上月|上个月)/.test(intentText) && !/date_trunc\('month'/.test(sql);
      const needThisQuarter =
        /(本季度|本季)/.test(intentText) && !/date_trunc\('quarter'/.test(sql);
      const needLastQuarter =
        /(上季度|上季)/.test(intentText) && !/date_trunc\('quarter'/.test(sql);
      const needYearToDate =
        /(本年度至今|今年至今|本年|今年|YTD)/.test(intentText) && !/date_trunc\('year'/.test(sql);
      const needFirstHalf = /(上半年)/.test(intentText) && !/date_trunc\('year'/.test(sql);
      const needSecondHalf = /(下半年)/.test(intentText) && !/date_trunc\('year'/.test(sql);
      if (needThreeDays) {
        if (/\bwhere\b/i.test(sql)) {
          sql = sql.replace(/\s*(group\s+by|order\s+by|limit|offset)\b/i, ' $1');
          sql += " and transaction_date >= current_date - interval '3 days'";
        } else {
          sql += " where transaction_date >= current_date - interval '3 days'";
        }
      } else if (needSevenDays) {
        if (/\bwhere\b/i.test(sql)) {
          sql = sql.replace(/\s*(group\s+by|order\s+by|limit|offset)\b/i, ' $1');
          sql += " and transaction_date >= current_date - interval '7 days'";
        } else {
          sql += " where transaction_date >= current_date - interval '7 days'";
        }
      } else if (needThirtyDays) {
        if (/\bwhere\b/i.test(sql)) {
          sql = sql.replace(/\s*(group\s+by|order\s+by|limit|offset)\b/i, ' $1');
          sql += " and transaction_date >= current_date - interval '30 days'";
        } else {
          sql += " where transaction_date >= current_date - interval '30 days'";
        }
      } else if (needThreeMonths) {
        if (/\bwhere\b/i.test(sql)) {
          sql = sql.replace(/\s*(group\s+by|order\s+by|limit|offset)\b/i, ' $1');
          sql += " and transaction_date >= current_date - interval '3 months'";
        } else {
          sql += " where transaction_date >= current_date - interval '3 months'";
        }
      } else if (needNinetyDays) {
        if (/\bwhere\b/i.test(sql)) {
          sql = sql.replace(/\s*(group\s+by|order\s+by|limit|offset)\b/i, ' $1');
          sql += " and transaction_date >= current_date - interval '90 days'";
        } else {
          sql += " where transaction_date >= current_date - interval '90 days'";
        }
      } else if (needThisMonth) {
        const clause =
          "transaction_date >= date_trunc('month', current_date) and transaction_date < date_trunc('month', current_date) + interval '1 month'";
        if (/\bwhere\b/i.test(sql)) {
          sql += ' and ' + clause;
        } else {
          sql += ' where ' + clause;
        }
      } else if (needLastMonth) {
        const clause =
          "transaction_date >= date_trunc('month', current_date - interval '1 month') and transaction_date < date_trunc('month', current_date)";
        if (/\bwhere\b/i.test(sql)) {
          sql += ' and ' + clause;
        } else {
          sql += ' where ' + clause;
        }
      } else if (needThisQuarter) {
        const clause =
          "transaction_date >= date_trunc('quarter', current_date) and transaction_date < date_trunc('quarter', current_date) + interval '3 months'";
        if (/\bwhere\b/i.test(sql)) {
          sql += ' and ' + clause;
        } else {
          sql += ' where ' + clause;
        }
      } else if (needLastQuarter) {
        const clause =
          "transaction_date >= date_trunc('quarter', current_date - interval '3 months') and transaction_date < date_trunc('quarter', current_date)";
        if (/\bwhere\b/i.test(sql)) {
          sql += ' and ' + clause;
        } else {
          sql += ' where ' + clause;
        }
      } else if (needYearToDate) {
        const clause = "transaction_date >= date_trunc('year', current_date)";
        if (/\bwhere\b/i.test(sql)) {
          sql += ' and ' + clause;
        } else {
          sql += ' where ' + clause;
        }
      } else if (needFirstHalf) {
        const clause =
          "transaction_date >= date_trunc('year', current_date) and transaction_date < date_trunc('year', current_date) + interval '6 months'";
        if (/\bwhere\b/i.test(sql)) {
          sql += ' and ' + clause;
        } else {
          sql += ' where ' + clause;
        }
      } else if (needSecondHalf) {
        const clause =
          "transaction_date >= date_trunc('year', current_date) + interval '6 months' and transaction_date < date_trunc('year', current_date) + interval '12 months'";
        if (/\bwhere\b/i.test(sql)) {
          sql += ' and ' + clause;
        } else {
          sql += ' where ' + clause;
        }
      }

      // 4.4 明细意图优先：若用户包含“明细/列表/记录/前N条”，则强制覆盖为列表型回退
      const wantsDetailIntent = /明细|列表|记录/.test(intentText) || /前\d+条/.test(intentText);
      const wantsDetailIntentStrong = /明细|列表|记录|前\d+条/.test(effectiveQuery || '');
      if (wantsDetailIntent || wantsDetailIntentStrong) {
        const fbDetail = await this.buildFallbackSql(effectiveQuery, userId);
        this.logger.log(
          `[AiService] wantsDetailIntent=${wantsDetailIntent}, wantsDetailIntentStrong=${wantsDetailIntentStrong}, intentText=${intentText}`,
        );
        if (fbDetail) {
          sql = fbDetail.sql;
          paramsForSql = fbDetail.params;
          this.logger.log('[AiService] Detail intent fallback applied.');
        }
      }

      // 5. 注入分页（PostgreSQL LIMIT/OFFSET），仅对非聚合/非分组查询生效
      const hasAggregates = /\bselect\b[\s\S]*\b(sum|avg|min|max|count)\s*\(/i.test(sql);
      const hasGroupBy = /\bgroup\s+by\b/i.test(sql);
      const isAggregatedQuery = hasAggregates || hasGroupBy;
      if (!isAggregatedQuery) {
        const isSelectDistinct =
          /\bselect\s+distinct\b/i.test(sql) || /\bwith\b[\s\S]*\bselect\s+distinct\b/i.test(sql);
        const hasLimit = /\blimit\s+(\d+|\$\d+)/i.test(sql);
        const hasOffset = /\boffset\s+(\d+|\$\d+)/i.test(sql);
        const hasOrder = /\border\s+by\b/i.test(sql);
        if (isSelectDistinct) {
          const orderFields = this.computeDistinctOrderFields(sql);
          const orderClauseRegex = /\border\s+by\b[\s\S]*?(?=(\blimit\b|\boffset\b|\bfetch\b|$))/i;
          if (hasOrder) {
            sql = sql.replace(orderClauseRegex, ` order by ${orderFields} `);
          } else {
            sql += ` order by ${orderFields}`;
          }
        } else if (!hasOrder && /\bfrom\s+transactions\b/i.test(sql)) {
          sql += ' order by transaction_date desc';
        }
        if (!hasLimit) {
          sql += ` limit ${limit}`;
        }
        if (!hasOffset) {
          sql += ` offset ${offset}`;
        }
      }

      // 6. 执行 SQL
      // 在生产环境中需要更严格的沙箱机制
      let rawResult: any[] = [];
      const queryRunner = this.transactionRepository.manager.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        await queryRunner.query('SET TRANSACTION READ ONLY');
        rawResult = await queryRunner.query(sql, paramsForSql);
        await queryRunner.commitTransaction();
      } catch (execErr: any) {
        await queryRunner.rollbackTransaction();
        this.logger.error('[AiService] SQL 执行失败:', execErr);
        return {
          success: false,
          message: 'SQL 执行失败，请检查表结构与语法',
          reason: 'SQL_EXECUTION_ERROR',
          debug: { sql, error: String(execErr?.message || execErr) },
        };
      } finally {
        await queryRunner.release();
      }

      const duration = Date.now() - startAt;
      this.logger.log(`[AiService] SQL 执行完成: rows=${rawResult.length}, duration=${duration}ms`);

      // 7. 结果快速总结（避免二次 LLM 调用，提升响应速度）
      const summaryText = this.buildQuickSummary(effectiveQuery, rawResult);

      const payload = {
        success: true,
        answer: summaryText,
        debug: { sql, rawResult, page, limit, offset, duration },
      };
      try {
        await this.redis.set(cacheKey, JSON.stringify(payload), 'EX', 24 * 60 * 60);
        // 保存最后一次成功的财务查询上下文，用于多轮对话
        await this.redis.set(
          `ai:context:last_query:${userId}`,
          JSON.stringify({ query: effectiveQuery, sql }),
          'EX',
          300,
        ); // 5分钟过期
      } catch {}
      return payload;
    } catch (error) {
      this.logger.error('[AiService] NLQ Failed:', error);
      return {
        success: false,
        message: '抱歉，我暂时无法理解这个问题。',
        reason: 'UNKNOWN',
        debug: { error: String((error as any)?.message || error) },
      };
    }
  }

  /**
   * 构建 NLQ 缓存键
   * @param query 用户查询文本
   * @param userId 当前用户ID
   * @param opts 选项参数
   */
  private buildNlqCacheKey(
    query: string,
    userId: string,
    opts: { page: number; limit: number; fastMode: boolean },
    version: number,
  ) {
    const h = crypto.createHash('sha256');
    h.update(
      `${userId}|v:${version}|${opts.page}|${opts.limit}|${opts.fastMode ? 1 : 0}|${(query || '').trim()}`,
    );
    const digest = h.digest('hex');
    return `ai:cache:nlq:${digest}`;
  }

  private computeDistinctOrderFields(sql: string): string {
    const m = sql.match(/\bselect\s+distinct\s+([\s\S]*?)\bfrom\b/i);
    const list = m ? m[1] || '' : '';
    const s = list;
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let count = 0;
    let hasNonSpace = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inSingle) {
        if (ch === "'") {
          if (i + 1 < s.length && s[i + 1] === "'") {
            i++;
          } else {
            inSingle = false;
          }
        }
        continue;
      }
      if (inDouble) {
        if (ch === '"') {
          if (i + 1 < s.length && s[i + 1] === '"') {
            i++;
          } else {
            inDouble = false;
          }
        }
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        hasNonSpace = true;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        hasNonSpace = true;
        continue;
      }
      if (ch === '(') {
        depth++;
        hasNonSpace = true;
        continue;
      }
      if (ch === ')') {
        if (depth > 0) depth--;
        continue;
      }
      if (ch === ',') {
        if (depth === 0) {
          count++;
        }
        continue;
      }
      if (!/\s/.test(ch)) {
        hasNonSpace = true;
      }
    }
    const n = hasNonSpace ? count + 1 : 1;
    return Array.from({ length: n }, (_, i) => String(i + 1)).join(',');
  }

  /**
   * 基于查询结果生成快速总结文本
   * @param query 用户查询文本
   * @param rows SQL 执行结果行
   */
  private buildQuickSummary(query: string, rows: any[]): string {
    const q = (query || '').replace(/\s+/g, '');
    if (/账本|帐本|账簿|账册|账目/.test(q)) {
      if (!rows || rows.length === 0) {
        return '您当前暂无账本，请先创建一个账本。';
      }
      const names = rows.map((r) => r.name).filter(Boolean);
      const count = rows.length;
      const top = names.slice(0, 3).join('，');
      const defaults = rows.filter((r) => r.is_default).map((r) => r.name);
      const defaultInfo = defaults.length > 0 ? `默认账本：${defaults[0]}` : '暂无默认账本';
      return `您当前共有 ${count} 个账本：${top}${count > 3 ? ' 等' : ''}。${defaultInfo}。`;
    }
    if (!rows || rows.length === 0) {
      return '本次查询无数据，请更换时间或条件后再试。';
    }
    // 分类统计
    if (rows[0] && 'category' in rows[0] && 'total' in rows[0]) {
      const top = rows
        .slice(0, 3)
        .map((r) => `${r.category || '未分类'}:${Number(r.total).toFixed(2)}元`)
        .join('，');
      return `分类统计完成，Top3为：${top}${rows.length > 3 ? ' 等' : ''}。`;
    }
    // 总额统计
    if (rows[0] && 'total' in rows[0]) {
      const total = Number(rows[0].total);
      return `合计金额为 ${total.toFixed(2)} 元。`;
    }
    // 明细列表
    const count = rows.length;
    const first = rows[0];
    const amount = first?.amount !== undefined ? Number(first.amount).toFixed(2) : '';
    const desc = first?.description ? String(first.description) : '';
    const date = first?.transaction_date || first?.transactionDate;
    const dateText = date ? new Date(date).toISOString().slice(0, 10) : '';
    const prefix = /收入/.test(q) ? '收入' : /支出/.test(q) ? '支出' : '交易';
    return `共返回 ${count} 条${prefix}记录。最近一条为 ${dateText}，金额 ${amount}，${desc ? `备注 ${desc}` : '无备注'}。`;
  }

  /**
   * 构建回退 SQL（安全注入版本）
   * 仅使用固定白名单与参数化占位符，避免用户输入参与拼接
   * 分类匹配严格遵循系统与用户现有分类，实时查询，不使用硬编码类别
   */
  private async buildFallbackSql(
    input: string,
    userId: string,
  ): Promise<{ sql: string; params: any[] } | null> {
    const q = (input || '').replace(/\s+/g, '');
    this.logger.log(`[AiService] Fallback解析文本: "${q}"`);
    const ledgerKeywords = ['账本', '帐本', '账簿', '账册', '账目'];
    const generalWords = ['有哪些', '哪些', '存在', '查看', '列出', '列表', '显示', '现在'];
    const hasLedgerKeyword = ledgerKeywords.some((k) => q.includes(k));
    const hasGeneralWord = generalWords.some((k) => q.includes(k));
    const hasLedgerHint = /账|帐/.test(q);
    const transactionWords = /支出|收入|交易|金额|合计|总额|分类/;
    const wantsLedgers =
      (hasLedgerKeyword || (hasLedgerHint && hasGeneralWord)) && !transactionWords.test(q);
    this.logger.log(`[AiService] Fallback意图判断 wantsLedgers=${wantsLedgers}`);
    if (wantsLedgers) {
      const sql =
        'select l.id, l.name, l.type, l.is_default, l.created_at from ledgers l join ledger_members lm on lm.ledger_id = l.id where lm.user_id = $1 order by l.created_at asc';
      return { sql, params: [userId] };
    }
    let type: 'income' | 'expense' | null = null;
    if (q.includes('支出')) type = 'expense';
    if (q.includes('收入')) type = 'income';
    const wantsDetail =
      q.includes('明细') || q.includes('列表') || q.includes('记录') || /前\d+条/.test(q);
    const topMatch = q.match(/前(\d{1,4})条/);
    const topN = topMatch ? Math.max(1, Math.min(1000, parseInt(topMatch[1], 10))) : null;
    let dateClause: string | null = null;
    if (q.includes('本月')) {
      dateClause =
        "transaction_date >= date_trunc('month', current_date) and transaction_date < date_trunc('month', current_date) + interval '1 month'";
    } else if (q.includes('上月') || q.includes('上个月')) {
      dateClause =
        "transaction_date >= date_trunc('month', current_date - interval '1 month') and transaction_date < date_trunc('month', current_date)";
    } else if (
      q.includes('最近7天') ||
      q.includes('近7天') ||
      q.includes('七天') ||
      q.includes('7天') ||
      q.includes('最近3天') ||
      q.includes('近3天') ||
      q.includes('三天') ||
      q.includes('3天') ||
      q.includes('最近30天') ||
      q.includes('近30天') ||
      q.includes('三十天') ||
      q.includes('30天') ||
      q.includes('最近3月') ||
      q.includes('近3月') ||
      q.includes('三个月') ||
      q.includes('3个月') ||
      q.includes('最近90天') ||
      q.includes('近90天') ||
      q.includes('九十天') ||
      q.includes('90天') ||
      q.includes('本季度') ||
      q.includes('本季') ||
      q.includes('上季度') ||
      q.includes('上季') ||
      q.includes('本年度至今') ||
      q.includes('今年至今') ||
      q.includes('本年') ||
      q.includes('今年') ||
      q.includes('YTD') ||
      q.includes('上半年') ||
      q.includes('下半年')
    ) {
      if (q.includes('最近3天') || q.includes('近3天') || q.includes('三天') || q.includes('3天')) {
        dateClause = "transaction_date >= current_date - interval '3 days'";
      } else if (
        q.includes('最近7天') ||
        q.includes('近7天') ||
        q.includes('七天') ||
        q.includes('7天')
      ) {
        dateClause = "transaction_date >= current_date - interval '7 days'";
      } else if (
        q.includes('最近30天') ||
        q.includes('近30天') ||
        q.includes('三十天') ||
        q.includes('30天')
      ) {
        dateClause = "transaction_date >= current_date - interval '30 days'";
      } else if (
        q.includes('最近90天') ||
        q.includes('近90天') ||
        q.includes('九十天') ||
        q.includes('90天')
      ) {
        dateClause = "transaction_date >= current_date - interval '90 days'";
      } else if (
        q.includes('最近3月') ||
        q.includes('近3月') ||
        q.includes('三个月') ||
        q.includes('3个月')
      ) {
        dateClause = "transaction_date >= current_date - interval '3 months'";
      } else if (q.includes('本季度') || q.includes('本季')) {
        dateClause =
          "transaction_date >= date_trunc('quarter', current_date) and transaction_date < date_trunc('quarter', current_date) + interval '3 months'";
      } else if (q.includes('上季度') || q.includes('上季')) {
        dateClause =
          "transaction_date >= date_trunc('quarter', current_date - interval '3 months') and transaction_date < date_trunc('quarter', current_date)";
      } else if (
        q.includes('本年度至今') ||
        q.includes('今年至今') ||
        q.includes('本年') ||
        q.includes('今年') ||
        q.includes('YTD')
      ) {
        dateClause = "transaction_date >= date_trunc('year', current_date)";
      } else if (q.includes('上半年')) {
        dateClause =
          "transaction_date >= date_trunc('year', current_date) and transaction_date < date_trunc('year', current_date) + interval '6 months'";
      } else if (q.includes('下半年')) {
        dateClause =
          "transaction_date >= date_trunc('year', current_date) + interval '6 months' and transaction_date < date_trunc('year', current_date) + interval '12 months'";
      }
    }
    // 实时分类匹配：仅匹配系统/用户已有分类名称，最长匹配优先
    let matchedCat: string | null = null;
    try {
      const qb = this.categoryRepository
        .createQueryBuilder('c')
        .where('(c.userId = :userId OR c.isSystem = true)', { userId });
      if (type) {
        qb.andWhere('c.type = :type', { type });
      }
      const categories = await qb.select(['c.id', 'c.name', 'c.type']).getMany();
      const qLower = q.toLowerCase();
      // 按名称长度降序，最长优先，避免“餐饮”比“餐饮类”先匹配
      const sorted = categories.map((c) => c.name).sort((a, b) => b.length - a.length);
      matchedCat = sorted.find((name) => qLower.includes(String(name).toLowerCase())) || null;
    } catch (e: any) {
      this.logger.warn('[AiService] 实时分类匹配失败，忽略分类过滤:', e?.message || e);
    }
    const groupByCategory =
      q.includes('分类') ||
      (!!matchedCat && (q.includes('各') || q.includes('每') || q.includes('分')));
    const wantTotal =
      q.includes('总额') || q.includes('合计') || q.includes('总计') || q.includes('总数');
    const hasFinanceSignal =
      type !== null || groupByCategory || wantTotal || !!matchedCat || !!dateClause || wantsDetail;
    const whereParts: string[] = [];
    const params: any[] = [];
    whereParts.push(`transactions.user_id = $${params.length + 1}`);
    params.push(userId);
    if (type) {
      whereParts.push(`transactions.type = $${params.length + 1}`);
      params.push(type);
    }
    if (dateClause) {
      whereParts.push(dateClause);
    }
    const baseWhere = whereParts.join(' and ');
    if (wantsDetail) {
      if (matchedCat) {
        const where2Parts = [baseWhere, `categories.name ilike $${params.length + 1}`].filter(
          Boolean,
        );
        params.push(`%${matchedCat}%`);
        let sql =
          'select transactions.id, transactions.amount, transactions.type, transactions.description, transactions.merchant, transactions.transaction_date, transactions.category_id, transactions.ledger_id, categories.name as category ' +
          'from transactions left join categories on categories.id = transactions.category_id where ' +
          where2Parts.join(' and ') +
          ' order by transactions.transaction_date desc';
        if (topN) {
          sql += ` limit $${params.length + 1}`;
          params.push(topN);
        }
        return { sql, params };
      } else {
        let sql =
          'select id, amount, type, description, merchant, transaction_date, category_id, ledger_id ' +
          'from transactions where ' +
          baseWhere +
          ' order by transaction_date desc';
        if (topN) {
          sql += ` limit $${params.length + 1}`;
          params.push(topN);
        }
        return { sql, params };
      }
    }
    if (groupByCategory || matchedCat) {
      const where2Parts = [
        baseWhere,
        matchedCat ? `categories.name ilike $${params.length + 1}` : null,
      ]
        .filter(Boolean)
        .join(' and ');
      if (matchedCat) {
        params.push(`%${matchedCat}%`);
      }
      const sql =
        'select coalesce(sum(transactions.amount),0) as total, categories.name as category from transactions left join categories on categories.id = transactions.category_id where ' +
        where2Parts +
        ' group by categories.name order by total desc';
      return { sql, params };
    } else if (hasFinanceSignal) {
      const sql = 'select coalesce(sum(amount),0) as total from transactions where ' + baseWhere;
      return { sql, params };
    }
    return null;
  }

  /**
   * 保存模型到本地
   */
  private async saveModel(count: number) {
    try {
      // natural.BayesClassifier 可以序列化为 JSON
      const data = JSON.stringify(this.classifier);
      await fs.promises.writeFile(this.MODEL_FILE, data, 'utf8');

      const meta = {
        lastTrainedAt: new Date(),
        transactionCount: count,
      };
      await fs.promises.writeFile(this.META_FILE, JSON.stringify(meta), 'utf8');
      this.logger.log(`[AiService] 模型已保存 (样本数: ${count})`);
    } catch (error) {
      this.logger.error('[AiService] 模型保存失败:', error);
    }
  }

  /**
   * 加载本地模型
   */
  private async loadModel(): Promise<{ count: number } | null> {
    try {
      if (fs.existsSync(this.MODEL_FILE) && fs.existsSync(this.META_FILE)) {
        const data = await fs.promises.readFile(this.MODEL_FILE, 'utf8');
        const metaRaw = await fs.promises.readFile(this.META_FILE, 'utf8');
        const meta = JSON.parse(metaRaw);

        // 恢复分类器
        this.classifier = natural.BayesClassifier.restore(JSON.parse(data));
        this.logger.log(`[AiService] 本地模型加载成功 (上次训练: ${meta.lastTrainedAt})`);
        return { count: meta.transactionCount || 0 };
      }
    } catch (error) {
      this.logger.error('[AiService] 模型加载失败:', error);
    }
    return null;
  }

  /**
   * 训练分类器
   * @param lastCount 上次训练时的样本数 (如果存在)
   */
  async trainClassifier(lastCount: number = 0) {
    try {
      const totalCount = await this.transactionRepository.count();

      // 如果数据量没有显著增加，且已有模型，则跳过训练
      if (lastCount > 0 && totalCount - lastCount < this.RETRAIN_THRESHOLD) {
        this.logger.log(
          `[AiService] 新增数据不足阈值 (${totalCount - lastCount} < ${this.RETRAIN_THRESHOLD})，跳过训练`,
        );
        return;
      }

      this.logger.log('[AiService] 开始训练分类器...');
      const transactions = await this.transactionRepository.find({
        relations: ['category'],
      });

      if (transactions.length < 5) {
        this.logger.warn('[AiService] 交易数据过少，跳过训练');
        return;
      }

      // 重新创建并训练
      this.classifier = new natural.BayesClassifier();

      for (const tx of transactions) {
        if (tx.description && tx.category) {
          this.classifier.addDocument(tx.description, tx.category.id);
        }
      }

      this.classifier.train();
      this.logger.log(`[AiService] 训练完成，样本数: ${transactions.length}`);

      // 保存模型
      await this.saveModel(transactions.length);
    } catch (error) {
      this.logger.error('[AiService] 训练失败:', error);
    }
  }

  /**
   * 预测分类
   */
  async predictCategory(description: string): Promise<string | null> {
    if (!this.classifier || !description) return null;
    try {
      const result = this.classifier.classify(description);
      console.log(`[AiService] 描述: "${description}" -> 预测分类 ID: ${result}`);
      return result;
    } catch (error) {
      console.error('[AiService] 预测失败:', error);
      return null;
    }
  }

  /**
   * 批量预测分类
   */
  async batchPredictCategory(descriptions: string[]): Promise<(string | null)[]> {
    if (!this.classifier || descriptions.length === 0) return descriptions.map(() => null);

    return descriptions.map((desc) => {
      try {
        if (!desc) return null;
        return this.classifier.classify(desc);
      } catch (_error) {
        return null;
      }
    });
  }

  /**
   * 综合财务健康度分析
   * 结合收支比、债务比、储蓄率
   */
  async getHealthAnalysis(userId: string) {
    const transactions = await this.transactionRepository.find({
      where: { userId },
    });

    const debts = await this.debtRepository.find({
      where: { userId, status: In([DebtStatus.PENDING, DebtStatus.PARTIAL, DebtStatus.OVERDUE]) },
    });

    if (transactions.length === 0) return null;

    let totalIncome = 0;
    let totalExpense = 0;
    for (const tx of transactions) {
      if (tx.type === 'income') totalIncome += Number(tx.amount);
      else totalExpense += Number(tx.amount);
    }

    const totalDebt = debts.reduce((sum: number, d: Debt) => sum + Number(d.remainingAmount), 0);

    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
    const debtToIncomeRatio = totalIncome > 0 ? (totalDebt / (totalIncome * 12)) * 100 : 0; // 以年收入为基准

    let score = 60;
    const insights = [];

    if (savingsRate > 20) {
      score += 20;
      insights.push('您的储蓄率表现优秀，建议继续保持。');
    } else if (savingsRate > 0) {
      score += 5;
      insights.push('您的储蓄率略低，建议减少非必要支出以提高抗风险能力。');
    } else {
      score -= 10;
      insights.push('本月处于入不敷出状态，请务必检查大额支出。');
    }

    if (debtToIncomeRatio < 30) {
      score += 20;
    } else if (debtToIncomeRatio > 50) {
      score -= 20;
      insights.push('债务负担较重，建议优先偿还高息债务。');
    }

    return {
      score: Math.min(100, Math.max(0, score)),
      savingsRate: savingsRate.toFixed(1),
      debtToIncomeRatio: debtToIncomeRatio.toFixed(1),
      insights,
    };
  }

  /**
   * 获取收支预测
   */
  async getForecast(userId: string) {
    // 获取过去 6 个月的月度数据
    const transactions = await this.transactionRepository.find({
      where: { userId },
      order: { transactionDate: 'ASC' },
    });

    const monthlyMap = new Map<string, number>();
    transactions.forEach((tx) => {
      if (tx.type === 'expense') {
        const month = tx.transactionDate.toISOString().substring(0, 7);
        monthlyMap.set(month, (monthlyMap.get(month) || 0) + Number(tx.amount));
      }
    });

    const data = Array.from(monthlyMap.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    if (data.length < 2) return null;

    const regressionData = data.map((d, i) => [i, d.amount]);
    const regression = ss.linearRegression(regressionData);
    const line = ss.linearRegressionLine(regression);

    const forecast = [];
    const lastIndex = data.length - 1;
    for (let i = 1; i <= 3; i++) {
      forecast.push({
        month: `下月 ${i}`,
        amount: Math.max(0, line(lastIndex + i)),
      });
    }

    return forecast;
  }

  private buildPrompt(query: string, userId: string, categoryMap: string): string {
    return `
你是一个精通 SQL 的财务助手。请将用户的中文自然语言转换为 PostgreSQL 可执行的 SELECT 语句。

【数据库 Schema - PostgreSQL】
- 表: transactions
  - id (uuid)
  - amount (numeric(18,2)): 正数表示金额
  - type (enum): 'income' (收入), 'expense' (支出), 'transfer' (转账)
  - description (text): 交易备注
  - merchant (varchar): 商户名称
  - transaction_date (timestamp): 交易时间
  - category_id (uuid): 关联 categories.id
  - ledger_id (uuid): 关联 ledgers.id
  - user_id (uuid): 所属用户 ID
- 表: categories
  - id (uuid)
  - name (varchar): 分类名称
- 表: ledgers
  - id (uuid)
  - name (varchar): 账本名称
- 表: ledger_members
  - ledger_id (uuid)
  - user_id (uuid)

【关联关系】
- transactions.category_id = categories.id
- transactions.ledger_id = ledgers.id
- transactions.ledger_id = ledger_members.ledger_id

【分类列表】
${categoryMap}

【必须规则】
1. 只返回可执行的纯 SQL，不要输出任何其他文字或 Markdown。
2. WHERE 子句必须包含 user_id = '${userId}'。
3. 使用下划线列名：transaction_date, category_id, user_id, amount, type。
4. 支出统计使用 type = 'expense'，收入统计使用 type = 'income'。
5. 时间查询：
   - 本月: transaction_date >= date_trunc('month', current_date)
   - 上月: transaction_date >= date_trunc('month', current_date - interval '1 month') AND transaction_date < date_trunc('month', current_date)
   - 最近7天: transaction_date >= current_date - interval '7 days'
   - 今年: transaction_date >= date_trunc('year', current_date)
6. 如果涉及分类名称，请 JOIN categories。如果涉及账本名称，请 JOIN ledgers。
7. 如果是查询明细，请返回 transaction_date, amount, categories.name as category, description 等核心字段。
8. 聚合查询（如“总计”、“多少”）请使用 SUM(amount) 或 COUNT(*)。

【示例】
- "本月餐饮花了多少？": SELECT SUM(amount) FROM transactions JOIN categories ON transactions.category_id = categories.id WHERE transactions.user_id = '${userId}' AND transactions.type = 'expense' AND categories.name LIKE '%餐饮%' AND transaction_date >= date_trunc('month', current_date);
- "最近7天的支出明细": SELECT transaction_date, amount, categories.name as category, description FROM transactions LEFT JOIN categories ON transactions.category_id = categories.id WHERE transactions.user_id = '${userId}' AND transactions.type = 'expense' AND transaction_date >= current_date - interval '7 days' ORDER BY transaction_date DESC;
- "我有哪些账本？": SELECT l.name FROM ledgers l JOIN ledger_members lm ON l.id = lm.ledger_id WHERE lm.user_id = '${userId}';

【用户查询】
"${query}"
    `;
  }
}
