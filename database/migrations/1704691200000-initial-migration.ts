import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialMigration1704691200000 implements MigrationInterface {
    name = 'InitialMigration1704691200000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        `);

        await queryRunner.query(`
            CREATE TYPE user_status AS ENUM ('active', 'inactive', 'locked');
        `);

        await queryRunner.query(`
            CREATE TYPE category_type AS ENUM ('income', 'expense');
        `);

        await queryRunner.query(`
            CREATE TYPE transaction_type AS ENUM ('income', 'expense');
        `);

        await queryRunner.query(`
            CREATE TYPE payment_method AS ENUM ('cash', 'bank_card', 'credit_card', 'wechat', 'alipay', 'other');
        `);

        await queryRunner.query(`
            CREATE TYPE debt_type AS ENUM ('borrow', 'lend');
        `);

        await queryRunner.query(`
            CREATE TYPE debt_status AS ENUM ('pending', 'partial', 'paid', 'overdue');
        `);

        await queryRunner.query(`
            CREATE TYPE theme_mode AS ENUM ('light', 'dark', 'system');
        `);

        await queryRunner.query(`
            CREATE TYPE currency AS ENUM ('CNY', 'USD', 'EUR', 'JPY');
        `);

        await queryRunner.query(`
            CREATE TYPE backup_type AS ENUM ('full', 'transactions', 'categories', 'debts', 'settings');
        `);

        await queryRunner.query(`
            CREATE TYPE log_action AS ENUM ('create', 'update', 'delete', 'restore');
        `);

        await queryRunner.query(`
            CREATE TYPE entity_type AS ENUM ('transaction', 'category', 'debt', 'debt_payment', 'user', 'settings');
        `);

        await queryRunner.query(`
            CREATE TABLE users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                full_name VARCHAR(100),
                status user_status DEFAULT 'active',
                last_login TIMESTAMP WITH TIME ZONE,
                login_attempts INTEGER DEFAULT 0,
                lock_until TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await queryRunner.query(`
            CREATE INDEX idx_users_username ON users(username);
        `);

        await queryRunner.query(`
            CREATE INDEX idx_users_email ON users(email);
        `);

        await queryRunner.query(`
            CREATE TABLE categories (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                type category_type NOT NULL,
                icon VARCHAR(50) DEFAULT 'default',
                color VARCHAR(7) DEFAULT '#1890ff',
                sort_order INTEGER DEFAULT 0,
                is_system BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                parent_id UUID REFERENCES categories(id) ON DELETE CASCADE
            );
        `);

        await queryRunner.query(`
            CREATE INDEX idx_categories_user_id ON categories(user_id);
        `);

        await queryRunner.query(`
            CREATE INDEX idx_categories_type ON categories(type);
        `);

        await queryRunner.query(`
            CREATE TABLE transactions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                amount DECIMAL(12, 2) NOT NULL,
                type transaction_type NOT NULL,
                description TEXT,
                payment_method payment_method,
                merchant VARCHAR(100),
                transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
                metadata JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
                is_deleted BOOLEAN DEFAULT FALSE,
                deleted_at TIMESTAMP WITH TIME ZONE
            );
        `);

        await queryRunner.query(`
            CREATE INDEX idx_transactions_user_id ON transactions(user_id);
        `);

        await queryRunner.query(`
            CREATE INDEX idx_transactions_date ON transactions(transaction_date);
        `);

        await queryRunner.query(`
            CREATE INDEX idx_transactions_user_date ON transactions(user_id, transaction_date);
        `);

        await queryRunner.query(`
            CREATE INDEX idx_transactions_user_type ON transactions(user_id, type);
        `);

        await queryRunner.query(`
            CREATE TABLE debts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                debtor_name VARCHAR(100) NOT NULL,
                original_amount DECIMAL(12, 2) NOT NULL,
                remaining_amount DECIMAL(12, 2) DEFAULT 0,
                debt_type debt_type NOT NULL,
                due_date DATE,
                paid_date DATE,
                status debt_status DEFAULT 'pending',
                description TEXT,
                interest_rate DECIMAL(5, 2) DEFAULT 0,
                reminder_date DATE,
                is_reminder_enabled BOOLEAN DEFAULT TRUE,
                is_notified BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                total_paid DECIMAL(12, 2) DEFAULT 0
            );
        `);

        await queryRunner.query(`
            CREATE INDEX idx_debts_user_id ON debts(user_id);
        `);

        await queryRunner.query(`
            CREATE INDEX idx_debts_status ON debts(status);
        `);

        await queryRunner.query(`
            CREATE INDEX idx_debts_due_date ON debts(due_date);
        `);

        await queryRunner.query(`
            CREATE TABLE debt_payments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                amount DECIMAL(12, 2) NOT NULL,
                payment_date DATE NOT NULL,
                note VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await queryRunner.query(`
            CREATE INDEX idx_debt_payments_debt_id ON debt_payments(debt_id);
        `);

        await queryRunner.query(`
            CREATE TABLE user_settings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                theme theme_mode DEFAULT 'system',
                currency currency DEFAULT 'CNY',
                language VARCHAR(10) DEFAULT 'zh-CN',
                date_format VARCHAR(50) DEFAULT 'YYYY-MM-DD',
                first_day_of_week INTEGER DEFAULT 0,
                decimal_places INTEGER DEFAULT 2,
                notification_settings JSONB,
                default_payment_method VARCHAR(50),
                quick_add_enabled BOOLEAN DEFAULT TRUE,
                data_reminder_enabled BOOLEAN DEFAULT TRUE,
                data_reminder_time VARCHAR(10) DEFAULT '20:00',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await queryRunner.query(`
            CREATE TABLE backup_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                backup_type backup_type DEFAULT 'full',
                file_name VARCHAR(255) NOT NULL,
                file_path VARCHAR(500),
                file_size BIGINT,
                is_encrypted BOOLEAN DEFAULT FALSE,
                record_count INTEGER,
                checksum VARCHAR(64),
                is_success BOOLEAN DEFAULT TRUE,
                error_message TEXT,
                expires_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await queryRunner.query(`
            CREATE INDEX idx_backup_logs_user_id ON backup_logs(user_id);
        `);

        await queryRunner.query(`
            CREATE TABLE transaction_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                action log_action NOT NULL,
                entity_type entity_type NOT NULL,
                entity_id VARCHAR(36) NOT NULL,
                old_data JSONB,
                new_data JSONB,
                changed_fields JSONB,
                ip_address VARCHAR(45),
                user_agent VARCHAR(500),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await queryRunner.query(`
            CREATE INDEX idx_logs_user_entity ON transaction_logs(user_id, entity_type, entity_id);
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE transaction_logs;`);
        await queryRunner.query(`DROP TABLE backup_logs;`);
        await queryRunner.query(`DROP TABLE user_settings;`);
        await queryRunner.query(`DROP TABLE debt_payments;`);
        await queryRunner.query(`DROP TABLE debts;`);
        await queryRunner.query(`DROP TABLE transactions;`);
        await queryRunner.query(`DROP TABLE categories;`);
        await queryRunner.query(`DROP TABLE users;`);

        await queryRunner.query(`DROP TYPE IF EXISTS entity_type;`);
        await queryRunner.query(`DROP TYPE IF EXISTS log_action;`);
        await queryRunner.query(`DROP TYPE IF EXISTS backup_type;`);
        await queryRunner.query(`DROP TYPE IF EXISTS currency;`);
        await queryRunner.query(`DROP TYPE IF EXISTS theme_mode;`);
        await queryRunner.query(`DROP TYPE IF EXISTS debt_status;`);
        await queryRunner.query(`DROP TYPE IF EXISTS debt_type;`);
        await queryRunner.query(`DROP TYPE IF EXISTS payment_method;`);
        await queryRunner.query(`DROP TYPE IF EXISTS transaction_type;`);
        await queryRunner.query(`DROP TYPE IF EXISTS category_type;`);
        await queryRunner.query(`DROP TYPE IF EXISTS user_status;`);
    }
}
