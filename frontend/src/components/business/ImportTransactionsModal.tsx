import React, { useState } from 'react';
import { Modal, Upload, Button, Table, message, Select, Steps, Statistic, Tag, Progress, Alert, Space } from 'antd';
import { InboxOutlined, CloudUploadOutlined, RobotOutlined, CheckCircleOutlined } from '@ant-design/icons';
import Papa from 'papaparse';
import dayjs from 'dayjs';
import { useDispatch, useSelector } from 'react-redux';
import { transactionService } from '../../services/transactionService';
import { fetchTransactions } from '../../store/slices/transactionSlice';
import { fetchOverview } from '../../store/slices/statisticsSlice';
import api from '../../services/api';
import { RootState } from '../../store';

const { Dragger } = Upload;
const { Step } = Steps;
const { Option } = Select;

interface ParsedTransaction {
  key: string;
  transactionDate: string;
  type: 'income' | 'expense';
  amount: number;
  description: string; // 商品说明/备注
  merchant: string; // 交易对方
  paymentMethod: string;
  categoryId?: string;
  categoryName?: string;
  status: 'pending' | 'predicted' | 'success' | 'failed';
  originalData: any;
}

interface ImportTransactionsModalProps {
  visible: boolean;
  onCancel?: () => void;
  onClose?: () => void;
  onSuccess: () => void;
}

/**
 * 导入账单弹窗
 * 负责解析 CSV、调用 AI 分类并批量导入交易；关闭时销毁节点以防遮罩残留
 */
/**
 * 导入账单弹窗
 * 负责解析 CSV、调用 AI 分类并批量导入交易；关闭时销毁节点以防遮罩残留
 * 兼容 onClose/onCancel 两种关闭回调，统一用于右上角关闭与遮罩关闭
 */
const ImportTransactionsModal: React.FC<ImportTransactionsModalProps> = ({ visible, onCancel, onClose, onSuccess }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedTransaction[]>([]);
  const [predicting, setPredicting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ total: number; success: number } | null>(null);
  
  const dispatch = useDispatch();
  const { categories } = useSelector((state: RootState) => state.categories);

  const handleBeforeUpload = (file: File) => {
    // 自动开始解析
    parseFile(file);
    return false;
  };

  const parseFile = (file: File) => {
    setParsing(true);
    setCurrentStep(0);
    
    // 尝试检测编码：支付宝通常是 GBK，微信通常是 UTF-8
    // 这里简单通过文件名或用户选择来判断，或者尝试用 GBK 读取，如果乱码则用 UTF-8
    // papaparse 支持 encoding
    // 简单策略：先尝试 GBK (支付宝)，如果不行再试 UTF-8。
    // 但 papaparse 在浏览器端需要 TextDecoder。
    
    const isAlipay = file.name.includes('alipay') || file.name.includes('支');
    const encoding = isAlipay ? 'GBK' : 'UTF-8';

    Papa.parse(file, {
      encoding: encoding,
      complete: (results) => {
        try {
          const transactions = processParsedData(results.data);
          setParsedData(transactions);
          setParsing(false);
          setCurrentStep(1);
          message.success(`成功解析 ${transactions.length} 条记录`);
        } catch (err) {
          console.error(err);
          message.error('解析失败，请检查文件格式');
          setParsing(false);
        }
      },
      error: (err) => {
        message.error(`文件读取失败: ${err.message}`);
        setParsing(false);
      }
    });
  };

  const processParsedData = (rows: any[]): ParsedTransaction[] => {
    // 识别表头行
    let headerIndex = -1;
    let type = 'unknown'; // alipay | wechat

    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const rowStr = rows[i].join(',');
      if (rowStr.includes('交易创建时间') && rowStr.includes('交易号')) {
        headerIndex = i;
        type = 'alipay';
        break;
      }
      if (rowStr.includes('交易时间') && rowStr.includes('交易类型') && rowStr.includes('收/支')) {
        headerIndex = i;
        type = 'wechat';
        break;
      }
    }

    if (headerIndex === -1) {
      throw new Error('无法识别账单格式');
    }

    const headers = rows[headerIndex].map((h: string) => h.trim());
    const dataRows = rows.slice(headerIndex + 1);
    const result: ParsedTransaction[] = [];

    dataRows.forEach((row, index) => {
      // 跳过空行或统计行
      if (row.length < 5) return;

      try {
        let item: ParsedTransaction | null = null;
        
        if (type === 'alipay') {
          // 支付宝: 交易创建时间, 交易号, 商品名称, ... , 金额, 收/支, ...
          // 注意：支付宝 CSV 有时最后几行是统计，需要过滤
          const dateStr = row[0]?.trim();
          if (!dateStr || !dateStr.match(/^\d{4}-\d{2}-\d{2}/)) return;

          // 实际上应该通过 header 查找索引
          const idxAmount = headers.findIndex((h: any) => h.includes('金额'));
          const idxType = headers.findIndex((h: any) => h.includes('收/支'));
          const idxDesc = headers.findIndex((h: any) => h.includes('商品名称'));
          const idxMerchant = headers.findIndex((h: any) => h.includes('交易对方'));
          
          if (idxAmount === -1) return;

          const typeStr = row[idxType]?.trim();
          if (typeStr === '不计收支') return;

          item = {
            key: `alipay-${index}`,
            transactionDate: dayjs(dateStr).toISOString(),
            type: typeStr === '支出' ? 'expense' : 'income',
            amount: parseFloat(row[idxAmount]),
            description: row[idxDesc]?.trim() || '支付宝交易',
            merchant: row[idxMerchant]?.trim() || '',
            paymentMethod: 'alipay',
            status: 'pending',
            originalData: row
          };
        } else if (type === 'wechat') {
          // 微信: 交易时间, 交易类型, 交易对方, 商品, 收/支, 金额(元), 支付方式, ...
          const dateStr = row[0]?.trim();
          if (!dateStr || !dateStr.match(/^\d{4}-\d{2}-\d{2}/)) return;

          const idxAmount = headers.findIndex((h: any) => h.includes('金额'));
          const idxType = headers.findIndex((h: any) => h.includes('收/支'));
          const idxDesc = headers.findIndex((h: any) => h.includes('商品'));
          const idxMerchant = headers.findIndex((h: any) => h.includes('交易对方'));

          const typeStr = row[idxType]?.trim();
          if (typeStr === '/' || typeStr === '不计收支') return; // 微信转账有时显示 /

          // 处理金额中的 ￥ 符号
          const amountVal = parseFloat(row[idxAmount]?.replace('¥', ''));

          item = {
            key: `wechat-${index}`,
            transactionDate: dayjs(dateStr).toISOString(),
            type: typeStr === '支出' ? 'expense' : 'income',
            amount: amountVal,
            description: row[idxDesc]?.trim() || '微信交易',
            merchant: row[idxMerchant]?.trim() || '',
            paymentMethod: 'wechat',
            status: 'pending',
            originalData: row
          };
        }

        if (item) {
          result.push(item);
        }
      } catch (e) {
        // 忽略解析错误的行
      }
    });

    return result;
  };

  const handlePredict = async () => {
    if (parsedData.length === 0) return;
    
    setPredicting(true);
    try {
      // 提取描述列表
      const descriptions = parsedData.map(item => `${item.merchant} ${item.description}`);
      
      // 调用批量预测接口
      const response = await api.post('/ai/batch-predict-category', { descriptions }, { headers: { 'X-Silent-Loading': 'true' } });
      const categoryIds = response.data.categoryIds;

      const newParsedData = parsedData.map((item, index) => {
        const predictedId = categoryIds[index];
        const category = categories.find(c => c.id === predictedId);
        
        // 只有当交易类型与预测分类类型一致时才应用预测结果
        // 比如：支出交易不能预测为收入分类
        if (category && category.type === item.type) {
            return {
                ...item,
                categoryId: category.id,
                categoryName: category.name,
                status: 'predicted' as const
            };
        }
        return item;
      });

      setParsedData(newParsedData);
      message.success('AI 分类预测完成');
    } catch (error) {
      console.error(error);
      message.error('AI 预测失败');
    } finally {
      setPredicting(false);
    }
  };

  const handleImport = async () => {
    const toImport = parsedData.filter(item => item.status !== 'success');
    if (toImport.length === 0) return;

    setImporting(true);
    try {
      const payload = toImport.map(item => ({
        amount: item.amount,
        type: item.type,
        categoryId: item.categoryId,
        description: item.description,
        paymentMethod: item.paymentMethod as any,
        merchant: item.merchant,
        transactionDate: item.transactionDate,
        metadata: { imported: true, original: item.originalData }
      }));

      // 分批提交，避免包过大（假设每批 50 条）
      const BATCH_SIZE = 50;
      let successCount = 0;

      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const batch = payload.slice(i, i + BATCH_SIZE);
        await transactionService.batchCreateTransactions(batch, { silent: true });
        successCount += batch.length;
      }

      setImportResult({ total: payload.length, success: successCount });
      setCurrentStep(2);
      message.success('导入完成');
      
      // 刷新数据
      dispatch(fetchTransactions({ page: 1, silent: true }) as any);
      dispatch(fetchOverview({ timeRange: 'month', silent: true }) as any);

      setTimeout(() => {
          onSuccess();
          handleReset();
      }, 2000);

    } catch (error) {
      console.error(error);
      message.error('导入过程中发生错误');
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFileList([]);
    setParsedData([]);
    setCurrentStep(0);
    setImportResult(null);
  };

  const columns = [
    {
      title: '日期',
      dataIndex: 'transactionDate',
      key: 'transactionDate',
      render: (text: string) => dayjs(text).format('YYYY-MM-DD'),
      width: 110,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type: string) => <Tag color={type === 'income' ? 'success' : 'error'}>{type === 'income' ? '收入' : '支出'}</Tag>
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      render: (amount: number, record: any) => (
        <span style={{ color: record.type === 'income' ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
          {amount.toFixed(2)}
        </span>
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string, record: any) => (
          <span>
              <div style={{fontWeight: 500}}>{record.merchant}</div>
              <div style={{fontSize: 12, color: '#888'}}>{text}</div>
          </span>
      )
    },
    {
      title: '分类',
      dataIndex: 'categoryId',
      key: 'categoryId',
      width: 150,
      render: (categoryId: string, record: any) => (
        <Select
          value={categoryId}
          style={{ width: '100%' }}
          placeholder="选择分类"
          onChange={(val) => {
            const newData = [...parsedData];
            const index = newData.findIndex(item => item.key === record.key);
            const cat = categories.find(c => c.id === val);
            if (index > -1 && cat) {
              newData[index].categoryId = val;
              newData[index].categoryName = cat.name;
              setParsedData(newData);
            }
          }}
        >
          {categories.filter(c => c.type === record.type).map(c => (
            <Option key={c.id} value={c.id}>{c.name}</Option>
          ))}
        </Select>
      )
    },
    {
        title: '状态',
        key: 'status',
        width: 80,
        render: (_: any, record: any) => {
            if (record.status === 'predicted') return <Tag color="blue" icon={<RobotOutlined />}>AI预测</Tag>;
            return null;
        }
    }
  ];

  return (
    <Modal
      title="导入账单"
      open={visible}
      onCancel={() => (onClose || onCancel)?.()}
      footer={null}
      width={900}
      destroyOnClose
      maskClosable={false}
      keyboard={false}
      className="import-modal"
    >
      <Steps current={currentStep} className="mb-6">
        <Step title="上传文件" description="支持支付宝/微信 CSV" />
        <Step title="预览与分类" description="AI 智能分类" />
        <Step title="完成导入" />
      </Steps>

      {currentStep === 0 && (
        <div className="p-8 text-center">
          <Dragger
            accept=".csv"
            beforeUpload={handleBeforeUpload}
            showUploadList={false}
            disabled={parsing}
            style={{ padding: '40px 0' }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">
              支持支付宝或微信导出的账单文件 (CSV 格式)
            </p>
          </Dragger>
          {parsing && <div className="mt-4"><Space><Progress type="circle" percent={50} size={20} /> 正在解析...</Space></div>}
        </div>
      )}

      {currentStep === 1 && (
        <div>
          <div className="flex justify-between mb-4">
            <Space>
                <Statistic title="待导入记录" value={parsedData.length} />
                <Statistic title="总金额" value={parsedData.reduce((acc, cur) => acc + cur.amount, 0)} precision={2} prefix="¥" style={{marginLeft: 20}} />
            </Space>
            <Space>
              <Button 
                icon={<RobotOutlined />} 
                onClick={handlePredict} 
                loading={predicting}
                type="default"
              >
                AI 智能分类
              </Button>
              <Button 
                type="primary" 
                icon={<CloudUploadOutlined />} 
                onClick={handleImport}
                loading={importing}
              >
                确认导入
              </Button>
            </Space>
          </div>
          
          <Alert 
             message="温馨提示" 
             description="请检查解析结果，特别是分类是否准确。AI 预测仅供参考。" 
             type="info" 
             showIcon 
             closable 
             style={{marginBottom: 16}}
          />

          <Table
            dataSource={parsedData}
            columns={columns}
            pagination={{ pageSize: 50 }}
            scroll={{ y: 400 }}
            size="small"
          />
        </div>
      )}

      {currentStep === 2 && (
        <div className="text-center p-8">
          <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 24 }} />
          <h2>导入成功</h2>
          <p>成功导入 {importResult?.success} 条交易记录</p>
          <Button type="primary" onClick={() => (onClose || onCancel)?.()}>
            关闭
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default ImportTransactionsModal;
