import { DataTypes, Model } from "sequelize";
import { sequelize } from "../db/sequelize.js";

export class User extends Model {}
User.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.TEXT, allowNull: false },
    role: { type: DataTypes.STRING(16), allowNull: false }
  },
  { sequelize, modelName: "User", tableName: "users" }
);

export class AuthSession extends Model {}
AuthSession.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    tokenHash: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    userAgent: DataTypes.TEXT,
    ipAddress: DataTypes.STRING,
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: DataTypes.DATE
  },
  { sequelize, modelName: "AuthSession", tableName: "auth_sessions" }
);

export class Wallet extends Model {}
Wallet.init(
  {
    userId: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
    alias: { type: DataTypes.STRING(80), allowNull: false, primaryKey: true },
    publicKey: { type: DataTypes.STRING, allowNull: false }
  },
  { sequelize, modelName: "Wallet", tableName: "wallets" }
);

export class Transaction extends Model {}
Transaction.init(
  {
    id: { type: DataTypes.STRING(32), primaryKey: true },
    payloadText: { type: DataTypes.TEXT, allowNull: false }
  },
  { sequelize, modelName: "Transaction", tableName: "transactions" }
);

export class SavedInvoice extends Model {}
SavedInvoice.init(
  {
    clientUserId: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
    transactionId: { type: DataTypes.STRING(32), allowNull: false, primaryKey: true }
  },
  { sequelize, modelName: "SavedInvoice", tableName: "saved_invoices" }
);

export class InvoiceTemplate extends Model {}
InvoiceTemplate.init(
  {
    userId: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false, primaryKey: true },
    html: { type: DataTypes.TEXT, allowNull: false }
  },
  { sequelize, modelName: "InvoiceTemplate", tableName: "invoice_templates" }
);

User.hasMany(AuthSession, { foreignKey: "userId" });
AuthSession.belongsTo(User, { foreignKey: "userId" });
User.hasMany(Wallet, { foreignKey: "userId" });
Wallet.belongsTo(User, { foreignKey: "userId" });
User.hasMany(InvoiceTemplate, { foreignKey: "userId" });
InvoiceTemplate.belongsTo(User, { foreignKey: "userId" });
SavedInvoice.belongsTo(User, { foreignKey: "clientUserId" });
SavedInvoice.belongsTo(Transaction, { foreignKey: "transactionId" });
Transaction.hasMany(SavedInvoice, { foreignKey: "transactionId" });

export const models = { User, AuthSession, Wallet, Transaction, SavedInvoice, InvoiceTemplate };
