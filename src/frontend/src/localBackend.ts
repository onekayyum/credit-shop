import type {
  Customer,
  CustomerBalance,
  Product,
  Transaction,
  backendInterface,
} from "./backend.d";

type CustomerRow = { id: number; name: string; mobile: string; createdAt: number };
type ProductRow = { id: number; name: string; price: number; barcode: string; createdAt: number };
type TransactionRow = {
  id: number;
  customerId: number;
  productName: string;
  note: string;
  amount: number;
  txType: string;
  timestamp: number;
  itemsJson?: string;
};

type CounterKey = "customer" | "product" | "transaction";

class IndexedDBStore {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("credit-shop-db", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("customers")) {
          db.createObjectStore("customers", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("products")) {
          db.createObjectStore("products", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("transactions")) {
          db.createObjectStore("transactions", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async tx(storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.dbPromise;
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const store = await this.tx(storeName, "readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []) as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  async getById<T>(storeName: string, id: number): Promise<T | undefined> {
    const store = await this.tx(storeName, "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  async put<T>(storeName: string, value: T): Promise<void> {
    const store = await this.tx(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async delete(storeName: string, id: number): Promise<void> {
    const store = await this.tx(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async nextId(counter: CounterKey): Promise<number> {
    const store = await this.tx("meta", "readwrite");
    return new Promise((resolve, reject) => {
      const key = `${counter}Counter`;
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const current = (getReq.result?.value as number | undefined) ?? 0;
        const next = current + 1;
        const putReq = store.put({ key, value: next });
        putReq.onsuccess = () => resolve(next);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }
}

const store = new IndexedDBStore();

const toCustomer = (r: CustomerRow): Customer => ({ ...r, id: BigInt(r.id), createdAt: BigInt(r.createdAt) });
const toProduct = (r: ProductRow): Product => ({ ...r, id: BigInt(r.id), createdAt: BigInt(r.createdAt) });
const toTransaction = (r: TransactionRow): Transaction => ({ ...r, id: BigInt(r.id), customerId: BigInt(r.customerId), timestamp: BigInt(r.timestamp) });

async function calcBalance(customer: Customer): Promise<CustomerBalance> {
  const txs = (await store.getAll<TransactionRow>("transactions")).filter((t) => t.customerId === Number(customer.id));
  let totalUdhaar = 0;
  let totalPaid = 0;
  let lastPaymentDate = 0;
  for (const tx of txs) {
    if (tx.txType === "payment") {
      totalPaid += tx.amount;
      lastPaymentDate = Math.max(lastPaymentDate, tx.timestamp);
    } else {
      totalUdhaar += tx.amount;
    }
  }
  return { customer, totalPaid, totalUdhaar, remainingBalance: totalUdhaar - totalPaid, lastPaymentDate: BigInt(lastPaymentDate) };
}

class LocalBackend implements backendInterface {
  async addCustomer(name: string, mobile: string): Promise<Customer | null> {
    const all = await store.getAll<CustomerRow>("customers");
    if (all.some((c) => c.mobile === mobile)) return null;
    const row: CustomerRow = { id: await store.nextId("customer"), name, mobile, createdAt: Date.now() };
    await store.put("customers", row);
    return toCustomer(row);
  }
  async addProduct(name: string, price: number, barcode: string): Promise<Product | null> {
    const all = await store.getAll<ProductRow>("products");
    if (all.some((p) => p.barcode === barcode)) return null;
    const row: ProductRow = { id: await store.nextId("product"), name, price, barcode, createdAt: Date.now() };
    await store.put("products", row);
    return toProduct(row);
  }
  async addTransaction(customerId: bigint, productName: string, note: string, amount: number, txType: string): Promise<Transaction | null> {
    const row: TransactionRow = { id: await store.nextId("transaction"), customerId: Number(customerId), productName, note, amount, txType, timestamp: Date.now() };
    await store.put("transactions", row);
    return toTransaction(row);
  }
  async addBatchTransaction(customerId: bigint, totalAmount: number, itemsJson: string, note: string): Promise<Transaction | null> {
    const row: TransactionRow = { id: await store.nextId("transaction"), customerId: Number(customerId), productName: "Batch", note, amount: totalAmount, txType: "udhaar", itemsJson, timestamp: Date.now() };
    await store.put("transactions", row);
    return toTransaction(row);
  }
  async bulkImportProducts(productList: Product[]): Promise<[bigint, bigint]> {
    let inserted = 0;
    let skipped = 0;
    for (const p of productList) {
      const ok = await this.addProduct(p.name, p.price, p.barcode);
      if (ok) inserted++; else skipped++;
    }
    return [BigInt(inserted), BigInt(skipped)];
  }
  async deleteCustomer(id: bigint): Promise<boolean> {
    await store.delete("customers", Number(id));
    const txs = await store.getAll<TransactionRow>("transactions");
    await Promise.all(txs.filter((t) => t.customerId === Number(id)).map((t) => store.delete("transactions", t.id)));
    return true;
  }
  async deleteProduct(id: bigint): Promise<boolean> { await store.delete("products", Number(id)); return true; }
  async deleteTransaction(id: bigint): Promise<boolean> { await store.delete("transactions", Number(id)); return true; }
  async getAllCustomers(): Promise<CustomerBalance[]> {
    const customers = (await store.getAll<CustomerRow>("customers")).sort((a,b)=>b.createdAt-a.createdAt).map(toCustomer);
    return Promise.all(customers.map(calcBalance));
  }
  async getAllProducts(): Promise<Product[]> {
    return (await store.getAll<ProductRow>("products")).sort((a,b)=>b.createdAt-a.createdAt).map(toProduct);
  }
  async getCustomerBalanceSummary(customerId: bigint): Promise<CustomerBalance | null> {
    const c = await store.getById<CustomerRow>("customers", Number(customerId));
    return c ? calcBalance(toCustomer(c)) : null;
  }
  async getCustomersSortedByBalance(): Promise<CustomerBalance[]> {
    const rows = await this.getAllCustomers();
    return rows.sort((a,b)=>b.remainingBalance-a.remainingBalance);
  }
  async getHighBalanceCustomers(threshold: number): Promise<CustomerBalance[]> {
    const rows = await this.getAllCustomers();
    return rows.filter((r)=>r.remainingBalance >= threshold);
  }
  async getInactiveCustomers(days: bigint): Promise<CustomerBalance[]> {
    const cutoff = Date.now() - Number(days) * 24 * 60 * 60 * 1000;
    const rows = await this.getAllCustomers();
    return rows.filter((r)=> Number(r.lastPaymentDate) < cutoff);
  }
  async getTransactionsForCustomer(customerId: bigint): Promise<Transaction[]> {
    return (await store.getAll<TransactionRow>("transactions"))
      .filter((t)=>t.customerId === Number(customerId))
      .sort((a,b)=>b.timestamp-a.timestamp)
      .map(toTransaction);
  }
  async searchCustomers(term: string): Promise<Customer[]> {
    const q = term.toLowerCase();
    return (await store.getAll<CustomerRow>("customers"))
      .filter((c)=> c.name.toLowerCase().includes(q) || c.mobile.includes(term))
      .map(toCustomer);
  }
  async searchProducts(term: string): Promise<Product[]> {
    const q = term.toLowerCase();
    return (await store.getAll<ProductRow>("products"))
      .filter((p)=> p.name.toLowerCase().includes(q) || p.barcode.includes(term))
      .map(toProduct);
  }
  async updateCustomer(id: bigint, name: string, mobile: string): Promise<boolean> {
    const all = await store.getAll<CustomerRow>("customers");
    if (all.some((c)=> c.mobile === mobile && c.id !== Number(id))) return false;
    const row = all.find((c)=>c.id===Number(id));
    if (!row) return false;
    await store.put("customers", { ...row, name, mobile });
    return true;
  }
  async updateProduct(id: bigint, name: string, price: number, barcode: string): Promise<boolean> {
    const all = await store.getAll<ProductRow>("products");
    if (all.some((p)=> p.barcode === barcode && p.id !== Number(id))) return false;
    const row = all.find((p)=>p.id===Number(id));
    if (!row) return false;
    await store.put("products", { ...row, name, price, barcode });
    return true;
  }
}

const backendSingleton = new LocalBackend();
export function getLocalBackend(): backendInterface { return backendSingleton; }
