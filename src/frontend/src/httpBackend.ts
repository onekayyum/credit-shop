import type {
  Customer,
  CustomerBalance,
  Product,
  Transaction,
  backendInterface,
} from "./backend.d";

interface ApiCustomer {
  id: string;
  name: string;
  mobile: string;
  createdAt: string;
}

interface ApiProduct {
  id: string;
  name: string;
  barcode: string;
  price: number;
  createdAt: string;
}

interface ApiTransaction {
  id: string;
  customerId: string;
  productName: string;
  note: string;
  amount: number;
  txType: string;
  timestamp: string;
  itemsJson?: string;
}

interface ApiCustomerBalance {
  customer: ApiCustomer;
  totalUdhaar: number;
  totalPaid: number;
  remainingBalance: number;
  lastPaymentDate: string;
}

function toCustomer(customer: ApiCustomer): Customer {
  return {
    ...customer,
    id: BigInt(customer.id),
    createdAt: BigInt(customer.createdAt),
  };
}

function toProduct(product: ApiProduct): Product {
  return {
    ...product,
    id: BigInt(product.id),
    createdAt: BigInt(product.createdAt),
  };
}

function toTransaction(transaction: ApiTransaction): Transaction {
  return {
    ...transaction,
    id: BigInt(transaction.id),
    customerId: BigInt(transaction.customerId),
    timestamp: BigInt(transaction.timestamp),
  };
}

function toCustomerBalance(balance: ApiCustomerBalance): CustomerBalance {
  return {
    ...balance,
    customer: toCustomer(balance.customer),
    lastPaymentDate: BigInt(balance.lastPaymentDate),
  };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const base = import.meta.env.VITE_API_BASE_URL || "/api";
  const response = await fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export class HttpBackend implements backendInterface {
  async addBatchTransaction(
    customerId: bigint,
    totalAmount: number,
    itemsJson: string,
    note: string,
  ): Promise<Transaction | null> {
    const data = await api<ApiTransaction | null>("/transactions/batch", {
      method: "POST",
      body: JSON.stringify({
        customerId: customerId.toString(),
        totalAmount,
        itemsJson,
        note,
      }),
    });
    return data ? toTransaction(data) : null;
  }

  async addCustomer(name: string, mobile: string): Promise<Customer | null> {
    const data = await api<ApiCustomer | null>("/customers", {
      method: "POST",
      body: JSON.stringify({ name, mobile }),
    });
    return data ? toCustomer(data) : null;
  }

  async addProduct(
    name: string,
    price: number,
    barcode: string,
  ): Promise<Product | null> {
    const data = await api<ApiProduct | null>("/products", {
      method: "POST",
      body: JSON.stringify({ name, price, barcode }),
    });
    return data ? toProduct(data) : null;
  }

  async addTransaction(
    customerId: bigint,
    productName: string,
    note: string,
    amount: number,
    txType: string,
  ): Promise<Transaction | null> {
    const data = await api<ApiTransaction | null>("/transactions", {
      method: "POST",
      body: JSON.stringify({
        customerId: customerId.toString(),
        productName,
        note,
        amount,
        txType,
      }),
    });
    return data ? toTransaction(data) : null;
  }

  async bulkImportProducts(
    productList: Array<Product>,
  ): Promise<[bigint, bigint]> {
    const data = await api<{ added: string; skipped: string }>(
      "/products/bulk-import",
      {
        method: "POST",
        body: JSON.stringify({
          productList: productList.map((p) => ({
            ...p,
            id: p.id.toString(),
            createdAt: p.createdAt.toString(),
          })),
        }),
      },
    );
    return [BigInt(data.added), BigInt(data.skipped)];
  }

  deleteCustomer(id: bigint): Promise<boolean> {
    return api<boolean>(`/customers/${id.toString()}`, { method: "DELETE" });
  }

  deleteProduct(id: bigint): Promise<boolean> {
    return api<boolean>(`/products/${id.toString()}`, { method: "DELETE" });
  }

  deleteTransaction(id: bigint): Promise<boolean> {
    return api<boolean>(`/transactions/${id.toString()}`, { method: "DELETE" });
  }

  async getAllCustomers(): Promise<Array<CustomerBalance>> {
    const data = await api<Array<ApiCustomerBalance>>("/customers");
    return data.map(toCustomerBalance);
  }

  async getAllProducts(): Promise<Array<Product>> {
    const data = await api<Array<ApiProduct>>("/products");
    return data.map(toProduct);
  }

  async getCustomerBalanceSummary(
    customerId: bigint,
  ): Promise<CustomerBalance | null> {
    const data = await api<ApiCustomerBalance | null>(
      `/customers/${customerId.toString()}/balance`,
    );
    return data ? toCustomerBalance(data) : null;
  }

  async getCustomersSortedByBalance(): Promise<Array<CustomerBalance>> {
    const data = await api<Array<ApiCustomerBalance>>(
      "/customers/sorted-by-balance",
    );
    return data.map(toCustomerBalance);
  }

  async getHighBalanceCustomers(
    threshold: number,
  ): Promise<Array<CustomerBalance>> {
    const data = await api<Array<ApiCustomerBalance>>(
      `/customers/high-balance?threshold=${encodeURIComponent(String(threshold))}`,
    );
    return data.map(toCustomerBalance);
  }

  async getInactiveCustomers(days: bigint): Promise<Array<CustomerBalance>> {
    const data = await api<Array<ApiCustomerBalance>>(
      `/customers/inactive?days=${encodeURIComponent(days.toString())}`,
    );
    return data.map(toCustomerBalance);
  }

  async getTransactionsForCustomer(
    customerId: bigint,
  ): Promise<Array<Transaction>> {
    const data = await api<Array<ApiTransaction>>(
      `/transactions/customer/${customerId.toString()}`,
    );
    return data.map(toTransaction);
  }

  async searchCustomers(term: string): Promise<Array<Customer>> {
    const data = await api<Array<ApiCustomer>>(
      `/customers/search?term=${encodeURIComponent(term)}`,
    );
    return data.map(toCustomer);
  }

  async searchProducts(term: string): Promise<Array<Product>> {
    const data = await api<Array<ApiProduct>>(
      `/products/search?term=${encodeURIComponent(term)}`,
    );
    return data.map(toProduct);
  }

  updateCustomer(id: bigint, name: string, mobile: string): Promise<boolean> {
    return api<boolean>(`/customers/${id.toString()}`, {
      method: "PUT",
      body: JSON.stringify({ name, mobile }),
    });
  }

  updateProduct(
    id: bigint,
    name: string,
    price: number,
    barcode: string,
  ): Promise<boolean> {
    return api<boolean>(`/products/${id.toString()}`, {
      method: "PUT",
      body: JSON.stringify({ name, price, barcode }),
    });
  }
}
