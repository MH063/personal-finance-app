import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import transactionReducer from './slices/transactionSlice';
import categoryReducer from './slices/categorySlice';
import debtReducer from './slices/debtSlice';
import statisticsReducer from './slices/statisticsSlice';
import settingsReducer from './slices/settingsSlice';
import budgetReducer from './slices/budgetSlice';
import notificationReducer from './slices/notificationSlice';
import aiReducer from './slices/aiSlice';
import appReducer from './slices/appSlice';
import ledgerReducer from './slices/ledgerSlice';
import { injectStore } from '../services/api';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    transactions: transactionReducer,
    categories: categoryReducer,
    debts: debtReducer,
    statistics: statisticsReducer,
    settings: settingsReducer,
    budgets: budgetReducer,
    notifications: notificationReducer,
    ai: aiReducer,
    app: appReducer,
    ledger: ledgerReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
});

// 注入 store 到 api 实例以避免循环依赖
injectStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
