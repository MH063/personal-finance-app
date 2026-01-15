import { DebtsService } from './debts.service';
import { PaymentStatus } from '../entities/debt-payment.entity';

describe('DebtsService 还款日期校验', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const createService = () => {
    const debtRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as any;

    const paymentRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as any;

    const logRepository = {
      save: jest.fn(),
    } as any;

    const settingRepository = {} as any;
    const notificationsService = {} as any;
    const ledgerGateway = { notifyUpdate: jest.fn() } as any;
    const transactionsService = { create: jest.fn() } as any;
    const categoriesService = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'cat1' }),
    } as any;

    const service = new DebtsService(
      debtRepository,
      paymentRepository,
      logRepository,
      settingRepository,
      notificationsService,
      ledgerGateway,
      transactionsService,
      categoriesService,
    );

    return {
      service,
      debtRepository,
      paymentRepository,
      logRepository,
      ledgerGateway,
      transactionsService,
    };
  };

  it('新增还款记录时，未来还款日期应被拒绝', async () => {
    const { service, debtRepository, paymentRepository } = createService();

    debtRepository.findOne.mockResolvedValue({
      id: 'd1',
      userId: 'u1',
      remainingAmount: 100,
      totalPaid: 0,
      paymentCount: 0,
      debtType: 'borrow',
      debtorName: '测试对象',
    });

    await expect(
      service.addPayment('u1', 'd1', {
        amount: 1,
        paymentDate: '2026-01-16',
        paymentMethod: 'cash',
      } as any),
    ).rejects.toThrow('还款日期不能超过当前时间');

    expect(paymentRepository.create).not.toHaveBeenCalled();
  });

  it('新增还款记录时，今天的还款日期应通过', async () => {
    const { service, debtRepository, paymentRepository } = createService();

    debtRepository.findOne.mockResolvedValue({
      id: 'd1',
      userId: 'u1',
      remainingAmount: 100,
      totalPaid: 0,
      paymentCount: 0,
      debtType: 'borrow',
      debtorName: '测试对象',
      status: 'partial',
    });

    paymentRepository.create.mockImplementation((v: any) => v);
    paymentRepository.save.mockResolvedValue({ id: 'p1' });
    debtRepository.save.mockResolvedValue({});

    const saved = await service.addPayment('u1', 'd1', {
      amount: 1,
      paymentDate: '2026-01-15',
      paymentMethod: 'cash',
    } as any);

    expect(saved).toEqual({ id: 'p1' });
    expect(paymentRepository.save).toHaveBeenCalled();
  });

  it('更新还款记录时，未来还款日期应被拒绝', async () => {
    const { service, paymentRepository } = createService();

    paymentRepository.findOne.mockResolvedValue({
      id: 'p1',
      debtId: 'd1',
      userId: 'u1',
      amount: 1,
      status: PaymentStatus.CONFIRMED,
      paymentDate: new Date(2026, 0, 15),
      debt: {},
    });

    await expect(
      service.updatePayment('u1', 'd1', 'p1', { paymentDate: '2026-01-16' } as any),
    ).rejects.toThrow('还款日期不能超过当前时间');

    expect(paymentRepository.save).not.toHaveBeenCalled();
  });

  it('更新还款记录时，今天的还款日期应通过', async () => {
    const { service, paymentRepository } = createService();

    paymentRepository.findOne.mockResolvedValue({
      id: 'p1',
      debtId: 'd1',
      userId: 'u1',
      amount: 1,
      status: PaymentStatus.CONFIRMED,
      paymentDate: new Date(2026, 0, 15),
      debt: {},
    });
    paymentRepository.save.mockResolvedValue({ id: 'p1' });

    const saved = await service.updatePayment('u1', 'd1', 'p1', {
      paymentDate: '2026-01-15',
    } as any);

    expect(saved).toEqual({ id: 'p1' });
    expect(paymentRepository.save).toHaveBeenCalled();
  });
});
