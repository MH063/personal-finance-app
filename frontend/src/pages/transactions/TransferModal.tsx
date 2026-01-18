import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, DatePicker, message } from 'antd';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { createTransaction } from '../../store/slices/transactionSlice';
import { fetchLedgers } from '../../store/slices/ledgerSlice';
import dayjs from 'dayjs';

interface TransferModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}


/**
 * 资金划转弹窗
 * 创建一笔类型为 transfer 的交易；关闭时销毁节点以防遮罩残留
 */
const TransferModal: React.FC<TransferModalProps> = ({ visible, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const dispatch = useDispatch<AppDispatch>();
  const [loading, setLoading] = useState(false);

  const { ledgers = [] } = useSelector((state: RootState) => state.ledger || {});

  useEffect(() => {
    if (visible) {
      dispatch(fetchLedgers());
      form.resetFields();
      form.setFieldsValue({
        transactionDate: dayjs(),
      });
    }
  }, [visible, dispatch, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (values.fromLedgerId === values.toLedgerId) {
        message.error('转出账户和转入账户不能相同');
        setLoading(false);
        return;
      }

      // 构建转账交易数据
      // 转账在系统中记录为一笔类型为 'transfer' 的交易
      // 其中 ledgerId 是转出账户，toLedgerId 是转入账户
      // 金额为正数
      const transferData = {
        amount: values.amount,
        type: 'transfer', // 确保后端支持 'transfer' 枚举
        description: values.description || '资金划转',
        transactionDate: values.transactionDate.format('YYYY-MM-DD HH:mm:ss'),
        ledgerId: values.fromLedgerId,
        toLedgerId: values.toLedgerId,
        isTransfer: true,
        reconciled: false,
      };

      await dispatch(createTransaction(transferData as any)).unwrap();
      
      message.success('转账成功');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Transfer failed:', error);
      message.error('转账失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="资金划转"
      open={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      width={500}
      destroyOnHidden
      maskClosable={false}
      keyboard={false}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          transactionDate: dayjs(),
        }}
      >
        <Form.Item
          name="amount"
          label="转账金额"
          rules={[{ required: true, message: '请输入金额' }]}
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0.01}
            precision={2}
            prefix="￥"
            placeholder="0.00"
          />
        </Form.Item>

        <Form.Item
          name="fromLedgerId"
          label="转出账户"
          rules={[{ required: true, message: '请选择转出账户' }]}
        >
          <Select
            placeholder="选择转出账户"
            options={ledgers.map(ledger => ({ value: ledger.id, label: ledger.name }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item
          name="toLedgerId"
          label="转入账户"
          rules={[{ required: true, message: '请选择转入账户' }]}
        >
          <Select
            placeholder="选择转入账户"
            options={ledgers.map(ledger => ({ value: ledger.id, label: ledger.name }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item
          name="transactionDate"
          label="转账日期"
          rules={[{ required: true, message: '请选择日期' }]}
        >
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="description"
          label="备注"
        >
          <Input.TextArea rows={2} placeholder="选填：转账备注" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default TransferModal;
