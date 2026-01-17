import React, { useState, useEffect } from 'react';
import { Modal, List, Button, Card, Form, Input, Select, Space, Typography, message, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, PlayCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { updateTransaction } from '../../store/slices/transactionSlice';
import { Transaction } from '../../services/transactionService';

interface AutomationRulesModalProps {
  visible: boolean;
  onClose: () => void;
  transactions: Transaction[]; // Pass current view transactions to apply rules
  onSuccess: () => void;
}

interface Rule {
  id: string;
  name: string;
  condition: {
    field: 'description' | 'merchant' | 'amount';
    operator: 'contains' | 'equals' | 'greater' | 'less';
    value: string;
  };
  action: {
    field: 'categoryId' | 'tag';
    value: string;
  };
}

const { Option } = Select;
const { Text } = Typography;

/**
 * 自动化规则弹窗
 * 负责对当前视图中的交易按规则批量更新分类或标签；关闭时销毁节点以防遮罩残留
 */
const AutomationRulesModal: React.FC<AutomationRulesModalProps> = ({ visible, onClose, transactions, onSuccess }) => {
  const dispatch = useDispatch<any>();
  const [rules, setRules] = useState<Rule[]>([]);
  const [editingRule, setEditingRule] = useState<Partial<Rule> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const { categories = [] } = useSelector((state: RootState) => state.categories || {});

  // Load rules from localStorage on mount
  useEffect(() => {
    const savedRules = localStorage.getItem('automation_rules');
    if (savedRules) {
      setRules(JSON.parse(savedRules));
    } else {
      // Default sample rule
      setRules([
        {
          id: '1',
          name: '咖啡自动分类',
          condition: { field: 'description', operator: 'contains', value: '咖啡' },
          action: { field: 'categoryId', value: categories.find(c => c.name.includes('餐饮'))?.id || '' }
        }
      ]);
    }
  }, [categories]);

  // Save rules to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('automation_rules', JSON.stringify(rules));
  }, [rules]);

  const handleAddRule = () => {
    setEditingRule({
      condition: { field: 'description', operator: 'contains', value: '' },
      action: { field: 'categoryId', value: '' }
    });
    setIsEditing(true);
  };

  const handleSaveRule = () => {
    if (!editingRule?.name || !editingRule?.condition?.value || !editingRule?.action?.value) {
      message.error('请完整填写规则信息');
      return;
    }

    const newRule = {
      ...editingRule,
      id: editingRule.id || Date.now().toString(),
    } as Rule;

    if (editingRule.id) {
      setRules(rules.map(r => r.id === newRule.id ? newRule : r));
    } else {
      setRules([...rules, newRule]);
    }
    setIsEditing(false);
    setEditingRule(null);
  };

  const handleDeleteRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
  };

  const handleApplyRules = async () => {
    if (rules.length === 0) return;
    setLoading(true);
    let matchCount = 0;
    
    try {
      const updates = [];
      
      for (const transaction of transactions) {
        // Skip already reconciled transactions to be safe? Or maybe allow updating them.
        // Let's skip reconciled for safety in this demo.
        if (transaction.reconciled) continue;

        let modified = false;
        const updatesForTx: any = {};

        for (const rule of rules) {
          let match = false;
          const { condition } = rule;
          
          if (condition.field === 'description') {
             if (condition.operator === 'contains' && transaction.description?.includes(condition.value)) match = true;
             if (condition.operator === 'equals' && transaction.description === condition.value) match = true;
          } else if (condition.field === 'merchant') {
             if (condition.operator === 'contains' && transaction.merchant?.includes(condition.value)) match = true;
          } else if (condition.field === 'amount') {
             const val = parseFloat(condition.value);
             if (condition.operator === 'greater' && transaction.amount > val) match = true;
             if (condition.operator === 'less' && transaction.amount < val) match = true;
             if (condition.operator === 'equals' && transaction.amount === val) match = true;
          }

          if (match) {
             if (rule.action.field === 'categoryId') {
               // Only update if different
               if (transaction.categoryId !== rule.action.value) {
                 updatesForTx.categoryId = rule.action.value;
                 modified = true;
               }
             } else if (rule.action.field === 'tag') {
               const currentTags = transaction.tags || [];
               if (!currentTags.includes(rule.action.value)) {
                 updatesForTx.tags = [...currentTags, rule.action.value];
                 modified = true;
               }
             }
          }
        }

        if (modified) {
          updates.push({ id: transaction.id, data: updatesForTx });
        }
      }

      if (updates.length > 0) {
        // Execute updates
        // Since we don't have batch update with different values, we loop
        // Limit to 50 to avoid browser freeze in demo
        const limit = 50;
        const updatesToRun = updates.slice(0, limit);
        
        await Promise.all(updatesToRun.map(u => dispatch(updateTransaction(u)).unwrap()));
        
        matchCount = updatesToRun.length;
        if (updates.length > limit) {
          message.warning(`匹配到 ${updates.length} 条记录，为防止卡顿仅更新了前 ${limit} 条`);
        } else {
          message.success(`成功更新 ${matchCount} 条记录`);
        }
        onSuccess();
      } else {
        message.info('当前视图中没有符合规则的记录');
      }

    } catch (error) {
      console.error('Apply rules error:', error);
      message.error('应用规则失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#faad14' }} />
          <span>自动化规则引擎</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      destroyOnClose
      maskClosable={false}
      keyboard={false}
      footer={[
        <Button key="close" onClick={onClose}>关闭</Button>,
        <Button 
          key="run" 
          type="primary" 
          icon={<PlayCircleOutlined />} 
          loading={loading}
          onClick={handleApplyRules}
        >
          立即运行 ({rules.length} 条规则)
        </Button>
      ]}
      width={700}
    >
      {!isEditing ? (
        <>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">规则将按照列表顺序执行，作用于当前列表视图中的所有记录。</Text>
            <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddRule}>添加规则</Button>
          </div>
          
          <List
            dataSource={rules}
            renderItem={rule => (
              <List.Item
                actions={[
                  <Button key={`del-${rule.id}`} type="text" danger icon={<DeleteOutlined />} onClick={() => handleDeleteRule(rule.id)} />
                ]}
              >
                <Card size="small" style={{ width: '100%' }}>
                  <Space split={<Text type="secondary">⮕</Text>}>
                    <Space>
                      <Tag>当</Tag>
                      <Text strong>{rule.condition.field === 'description' ? '备注' : (rule.condition.field === 'merchant' ? '商户' : '金额')}</Text>
                      <Text>{rule.condition.operator === 'contains' ? '包含' : (rule.condition.operator === 'equals' ? '等于' : rule.condition.operator)}</Text>
                      <Tag color="blue">{rule.condition.value}</Tag>
                    </Space>
                    <Space>
                      <Tag>执行</Tag>
                      <Text strong>{rule.action.field === 'categoryId' ? '设置分类' : '添加标签'}</Text>
                      <Tag color="green">
                        {rule.action.field === 'categoryId' 
                          ? categories.find(c => c.id === rule.action.value)?.name || rule.action.value 
                          : rule.action.value}
                      </Tag>
                    </Space>
                  </Space>
                </Card>
              </List.Item>
            )}
            locale={{ emptyText: '暂无规则，点击上方按钮添加' }}
          />
        </>
      ) : (
        <Card title="编辑规则" extra={<Button onClick={() => setIsEditing(false)}>取消</Button>}>
          <Form layout="vertical">
            <Form.Item label="规则名称" required>
              <Input 
                value={editingRule?.name} 
                onChange={e => setEditingRule({...editingRule, name: e.target.value})} 
                placeholder="例如：星巴克自动归类"
              />
            </Form.Item>
            
            <Space style={{ display: 'flex', marginBottom: 8 }} align="baseline">
              <Form.Item label="条件字段" required style={{ width: 120 }}>
                <Select 
                  value={editingRule?.condition?.field}
                  onChange={v => setEditingRule({...editingRule, condition: { ...editingRule.condition!, field: v }})}
                >
                  <Option value="description">备注</Option>
                  <Option value="merchant">商户</Option>
                  <Option value="amount">金额</Option>
                </Select>
              </Form.Item>
              <Form.Item label="操作符" required style={{ width: 100 }}>
                <Select 
                  value={editingRule?.condition?.operator}
                  onChange={v => setEditingRule({...editingRule, condition: { ...editingRule.condition!, operator: v }})}
                >
                  <Option value="contains">包含</Option>
                  <Option value="equals">等于</Option>
                  {editingRule?.condition?.field === 'amount' && <Option value="greater">大于</Option>}
                  {editingRule?.condition?.field === 'amount' && <Option value="less">小于</Option>}
                </Select>
              </Form.Item>
              <Form.Item label="值" required style={{ flex: 1 }}>
                <Input 
                  value={editingRule?.condition?.value}
                  onChange={e => setEditingRule({...editingRule, condition: { ...editingRule.condition!, value: e.target.value }})}
                  placeholder="匹配关键词"
                />
              </Form.Item>
            </Space>

            <Space style={{ display: 'flex' }} align="baseline">
              <Form.Item label="执行动作" required style={{ width: 120 }}>
                <Select 
                  value={editingRule?.action?.field}
                  onChange={v => setEditingRule({...editingRule, action: { ...editingRule.action!, field: v }})}
                >
                  <Option value="categoryId">设置分类</Option>
                  <Option value="tag">添加标签</Option>
                </Select>
              </Form.Item>
              <Form.Item label="目标值" required style={{ flex: 1 }}>
                {editingRule?.action?.field === 'categoryId' ? (
                  <Select 
                    value={editingRule?.action?.value}
                    onChange={v => setEditingRule({...editingRule, action: { ...editingRule.action!, value: v }})}
                    showSearch
                    optionFilterProp="children"
                  >
                    {categories.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                  </Select>
                ) : (
                  <Input 
                    value={editingRule?.action?.value}
                    onChange={e => setEditingRule({...editingRule, action: { ...editingRule.action!, value: e.target.value }})}
                    placeholder="标签名称"
                  />
                )}
              </Form.Item>
            </Space>

            <Button type="primary" block onClick={handleSaveRule} style={{ marginTop: 16 }}>
              保存规则
            </Button>
          </Form>
        </Card>
      )}
    </Modal>
  );
};

export default AutomationRulesModal;
