import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, DatePicker, message, Row, Col, Alert, Radio } from 'antd';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { createTransaction, updateTransaction } from '../../store/slices/transactionSlice';
import { fetchCategories } from '../../store/slices/categorySlice';
import { fetchLedgers } from '../../store/slices/ledgerSlice';
import { Transaction } from '../../services/transactionService';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

interface TransactionFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingTransaction?: Transaction | null;
  initialType?: 'income' | 'expense';
}

const { TextArea } = Input;

const TransactionFormModal: React.FC<TransactionFormModalProps> = ({ 
  visible, 
  onClose, 
  onSuccess, 
  editingTransaction,
  initialType = 'expense' 
}) => {
  const [form] = Form.useForm();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<'income' | 'expense'>(initialType);

  const { categories = [] } = useSelector((state: RootState) => state.categories || {});
  const { ledgers = [] } = useSelector((state: RootState) => state.ledger || {});

  // Filter categories by type
  const filteredCategories = categories.filter(c => c.type === type);

  useEffect(() => {
    if (visible) {
      if (editingTransaction) {
        // Edit mode
        setType(editingTransaction.type as 'income' | 'expense');
        form.setFieldsValue({
          ...editingTransaction,
          transactionDate: dayjs(editingTransaction.transactionDate),
          type: editingTransaction.type,
          warrantyEndDate: editingTransaction.metadata?.warrantyEndDate 
            ? dayjs(editingTransaction.metadata.warrantyEndDate) 
            : undefined,
        });
      } else {
        // Create mode
        setType(initialType);
        form.resetFields();
        form.setFieldsValue({
          transactionDate: dayjs(),
          type: initialType
        });
      }
      
      // Load dependencies
      dispatch(fetchCategories('income'));
      dispatch(fetchCategories('expense'));
      dispatch(fetchLedgers());
    }
  }, [visible, editingTransaction, initialType, dispatch, form]);

  const handleTypeChange = (value: 'income' | 'expense') => {
    setType(value);
    form.setFieldsValue({ categoryId: undefined }); // Clear category when type changes
  };



  const handleJumpToDebtEdit = () => {
    const debtId = (editingTransaction as any)?.metadata?.debtId;
    if (debtId) {
      onClose();
      navigate(`/debt?editDebtId=${encodeURIComponent(debtId)}`);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const metadata = {
        ...(editingTransaction?.metadata || {}),
        warrantyEndDate: values.warrantyEndDate ? values.warrantyEndDate.format('YYYY-MM-DD') : undefined,
      };

      const data = {
        ...values,
        transactionDate: values.transactionDate.format('YYYY-MM-DD HH:mm:ss'),
        metadata,
      };
      
      // Clean up top-level warrantyEndDate as it's not in the DTO
      delete data.warrantyEndDate;

      if (editingTransaction) {
        await dispatch(updateTransaction({ id: editingTransaction.id, data })).unwrap();
        message.success('更新成功');
      } else {
        await dispatch(createTransaction(data)).unwrap();
        message.success('添加成功');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Submit failed:', error);
      message.error(error.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const isDebtLink = !!editingTransaction?.metadata?.isDebtLink;

  return (
    <Modal
      title={editingTransaction ? '编辑交易' : '记一笔'}
      open={visible}
      onOk={isDebtLink ? handleJumpToDebtEdit : handleSubmit}
      onCancel={onClose}
      okText={isDebtLink ? '跳转至债务编辑' : '确定'}
      confirmLoading={loading}
      width={600}
      destroyOnHidden
      maskClosable={false}
      keyboard={false}
    >
      <Form form={form} layout="vertical">
        {isDebtLink && (
          <Alert
            title="仅查看模式"
            description="此交易关联至债务记录，为保证数据一致性，请前往“债务管理”模块进行修改。"
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />
        )}

        <Form.Item name="type" label="交易类型" hidden>
           <Input />
        </Form.Item>

        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <Radio.Group 
            value={type} 
            onChange={e => handleTypeChange(e.target.value)} 
            disabled={!!editingTransaction}
            buttonStyle="solid"
          >
            <Radio.Button value="expense">支出</Radio.Button>
            <Radio.Button value="income">收入</Radio.Button>
          </Radio.Group>
        </div>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="categoryId" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
              <Select 
                placeholder="选择分类" 
                disabled={isDebtLink}
                showSearch
                optionFilterProp="label"
                options={filteredCategories.map(c => ({ value: c.id, label: c.name }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="ledgerId" label="账本" rules={[{ required: true, message: '请选择账本' }]}>
              <Select
                placeholder="选择账本"
                disabled={isDebtLink}
                options={ledgers.map(l => ({ value: l.id, label: l.name }))}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item 
              name="amount" 
              label="金额" 
              rules={[{ required: true, message: '请输入金额' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0.01}
                precision={2}
                prefix={type === 'expense' ? '-' : '+'}
                disabled={isDebtLink}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="transactionDate" label="日期" rules={[{ required: true, message: '请选择日期' }]}>
              <DatePicker 
                showTime 
                style={{ width: '100%' }} 
                disabled={isDebtLink}
              />
            </Form.Item>
          </Col>
          {type === 'expense' && (
            <Col span={12}>
              <Form.Item name="warrantyEndDate" label="保修到期日" tooltip="录入后系统将在到期前提醒">
                <DatePicker style={{ width: '100%' }} placeholder="可选，针对电器等" />
              </Form.Item>
            </Col>
          )}
        </Row>

        <Form.Item name="tags" label="标签">
          <Select
            mode="tags"
            placeholder="输入标签并回车"
            style={{ width: '100%' }}
            tokenSeparators={[',']}
            disabled={isDebtLink}
          >
            {/* You can populate this with existing tags if available */}
          </Select>
        </Form.Item>

        <Form.Item name="paymentMethod" label="支付方式">
          <Select
            placeholder="选择支付方式"
            disabled={isDebtLink}
            options={[
              { value: 'bank_card', label: '银行卡' },
              { value: 'alipay', label: '支付宝' },
              { value: 'wechat', label: '微信' },
              { value: 'cash', label: '现金' },
              { value: 'credit_card', label: '信用卡' },
              { value: 'other', label: '其他' },
            ]}
          />
        </Form.Item>

        <Form.Item name="merchant" label="商户">
          <Input placeholder="请输入商户名称" disabled={isDebtLink} />
        </Form.Item>

        <Form.Item name="description" label="备注">
          <TextArea 
            rows={2} 
            placeholder="请输入备注" 
            disabled={isDebtLink}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default TransactionFormModal;
