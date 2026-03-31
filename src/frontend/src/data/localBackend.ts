import type {
  Customer,
  CustomerBalance,
  Product,
  Transaction,
  backendInterface,
} from "../backend.d";

type StoredCustomer = Omit<Customer, "id" | "createdAt"> & {
  id: string;
  createdAt: string;
};
type StoredProduct = Omit<Product, "id" | "createdAt"> & {
  id: string;
  createdAt: string;
};
type StoredTransaction = Omit<
  Transaction,
  "id" | "timestamp" | "customerId"
> & {
  id: string;
  timestamp: string;
  customerId: string;
};

interface DbState {
  meta: {
    nextCustomerId: number;
    nextProductId: number;
    nextTransactionId: number;
  };
  customers: StoredCustomer[];
  products: StoredProduct[];
  transactions: StoredTransaction[];
}

const DB_NAME = "credit-shop";
const STORE_NAME = "kv";
const STATE_KEY = "state";

const defaultState: DbState = {
  meta: {
    nextCustomerId: 1,
    nextProductId: 1,
    nextTransactionId: 1,
  },
  customers: [],
  products: [],
  transactions: [],
};

function toCustomer(c: StoredCustomer): Customer {
  return { ...c, id: BigInt(c.id), createdAt: BigInt(c.createdAt) };
}

function toProduct(p: StoredProduct): Product {
  return { ...p, id: BigInt(p.id), createdAt: BigInt(p.createdAt) };
}

function toTx(t: StoredTransaction): Transaction {
  return {
    ...t,
    id: BigInt(t.id),
    timestamp: BigInt(t.timestamp),
    customerId: BigInt(t.customerId),
  };
}

function toStoredCustomer(c: Customer): StoredCustomer {
  return { ...c, id: c.id.toString(), createdAt: c.createdAt.toString() };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readState(): Promise<DbState> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(STATE_KEY);
    req.onsuccess = () => {
      resolve(
        (req.result as DbState | undefined) ?? structuredClone(defaultState),
      );
    };
    req.onerror = () => reject(req.error);
  });
}

async function writeState(state: DbState): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(state, STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function buildBalance(customer: Customer, txs: Transaction[]): CustomerBalance {
  const totalUdhaar = txs
    .filter((tx) => tx.txType === "udhaar")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalPaid = txs
    .filter((tx) => tx.txType === "payment")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const paymentTxs = txs
    .filter((tx) => tx.txType === "payment")
    .sort((a, b) => Number(b.timestamp - a.timestamp));

  return {
    customer,
    totalPaid,
    totalUdhaar,
    remainingBalance: totalUdhaar - totalPaid,
    lastPaymentDate: paymentTxs[0]?.timestamp ?? customer.createdAt,
  };
}

class LocalBackend implements backendInterface {
  async addCustomer(name: string, mobile: string) {
    const state = await readState();
    if (state.customers.some((c) => c.mobile === mobile)) return null;

    const customer: Customer = {
      id: BigInt(state.meta.nextCustomerId++),
      name,
      mobile,
      createdAt: BigInt(Date.now()),
    };

    state.customers.push(toStoredCustomer(customer));
    await writeState(state);
    return customer;
  }

  async updateCustomer(id: bigint, name: string, mobile: string) {
    const state = await readState();
    const idx = state.customers.findIndex((c) => c.id === id.toString());
    if (idx === -1) return false;
    const duplicate = state.customers.some(
      (c, i) => i !== idx && c.mobile === mobile,
    );
    if (duplicate) return false;
    state.customers[idx].name = name;
    state.customers[idx].mobile = mobile;
    await writeState(state);
    return true;
  }

  async deleteCustomer(id: bigint) {
    const state = await readState();
    state.customers = state.customers.filter((c) => c.id !== id.toString());
    state.transactions = state.transactions.filter(
      (t) => t.customerId !== id.toString(),
    );
    await writeState(state);
    return true;
  }

  async addProduct(name: string, price: number, barcode: string) {
    const state = await readState();
    if (state.products.some((p) => p.barcode === barcode)) return null;
    const product: Product = {
      id: BigInt(state.meta.nextProductId++),
      name,
      price,
      barcode,
      createdAt: BigInt(Date.now()),
    };
    state.products.push({
      ...product,
      id: product.id.toString(),
      createdAt: product.createdAt.toString(),
    });
    await writeState(state);
    return product;
  }

  async updateProduct(id: bigint, name: string, price: number, barcode: string) {
    const state = await readState();
    const idx = state.products.findIndex((p) => p.id === id.toString());
    if (idx === -1) return false;
    const duplicate = state.products.some(
      (p, i) => i !== idx && p.barcode === barcode,
    );
    if (duplicate) return false;
    state.products[idx] = { ...state.products[idx], name, price, barcode };
    await writeState(state);
    return true;
  }

  async deleteProduct(id: bigint) {
    const state = await readState();
    state.products = state.products.filter((p) => p.id !== id.toString());
    await writeState(state);
    return true;
  }

  async addTransaction(
    customerId: bigint,
    productName: string,
    note: string,
    amount: number,
    txType: string,
  ) {
    const state = await readState();
    const tx: Transaction = {
      id: BigInt(state.meta.nextTransactionId++),
      customerId,
      productName,
      note,
      amount,
      txType,
      timestamp: BigInt(Date.now()),
    };
    state.transactions.push({
      ...tx,
      id: tx.id.toString(),
      customerId: tx.customerId.toString(),
      timestamp: tx.timestamp.toString(),
    });
    await writeState(state);
    return tx;
  }

  async addBatchTransaction(
    customerId: bigint,
    totalAmount: number,
    itemsJson: string,
    note: string,
  ) {
    return this.addTransaction(customerId, "Batch Items", note, totalAmount, "udhaar").then((tx) => {
      if (tx) tx.itemsJson = itemsJson;
      return tx;
    });
  }

  async deleteTransaction(id: bigint) {
    const state = await readState();
    state.transactions = state.transactions.filter((t) => t.id !== id.toString());
    await writeState(state);
    return true;
  }

  async getAllCustomers() {
    const state = await readState();
    const customers = state.customers.map(toCustomer);
    const txs = state.transactions.map(toTx);
    return customers
      .map((customer) =>
        buildBalance(
          customer,
          txs.filter((t) => t.customerId === customer.id),
        ),
      )
      .sort((a, b) => a.customer.name.localeCompare(b.customer.name));
  }

  async getCustomerBalanceSummary(customerId: bigint) {
    const state = await readState();
    const customer = state.customers.find((c) => c.id === customerId.toString());
    if (!customer) return null;
    const txs = state.transactions
      .map(toTx)
      .filter((t) => t.customerId === customerId);
    return buildBalance(toCustomer(customer), txs);
  }

  async getTransactionsForCustomer(customerId: bigint) {
    const state = await readState();
    return state.transactions
      .map(toTx)
      .filter((t) => t.customerId === customerId)
      .sort((a, b) => Number(b.timestamp - a.timestamp));
  }

  async getAllProducts() {
    const state = await readState();
    return state.products.map(toProduct);
  }

  async searchCustomers(term: string) {
    const q = term.toLowerCase();
    const state = await readState();
    return state.customers
      .map(toCustomer)
      .filter((c) => c.name.toLowerCase().includes(q) || c.mobile.includes(q));
  }

  async searchProducts(term: string) {
    const q = term.toLowerCase();
    const state = await readState();
    return state.products
      .map(toProduct)
      .filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q));
  }

  async getCustomersSortedByBalance() {
    const all = await this.getAllCustomers();
    return all.sort((a, b) => b.remainingBalance - a.remainingBalance);
  }

  async getHighBalanceCustomers(threshold: number) {
    const all = await this.getAllCustomers();
    return all.filter((c) => c.remainingBalance > threshold);
  }

  async getInactiveCustomers(days: bigint) {
    const all = await this.getAllCustomers();
    const cutoff = Date.now() - Number(days) * 24 * 60 * 60 * 1000;
    return all.filter((c) => Number(c.lastPaymentDate) < cutoff);
  }

  async bulkImportProducts(productList: Product[]): Promise<[bigint, bigint]> {
    const state = await readState();
    let added = 0;
    let skipped = 0;

    for (const p of productList) {
      if (state.products.some((existing) => existing.barcode === p.barcode)) {
        skipped += 1;
        continue;
      }
      const product: Product = {
        ...p,
        id: BigInt(state.meta.nextProductId++),
        createdAt: BigInt(Date.now()),
      };
      state.products.push({
        ...product,
        id: product.id.toString(),
        createdAt: product.createdAt.toString(),
      });
      added += 1;
    }

    await writeState(state);
    return [BigInt(added), BigInt(skipped)];
  }
}

export const localBackend = new LocalBackend();
