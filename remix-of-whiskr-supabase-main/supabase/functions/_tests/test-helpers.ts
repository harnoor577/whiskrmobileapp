// Test helpers and mocks for edge function testing

export function createMockSupabaseClient(mockResponses: Record<string, any>) {
  return {
    from: (table: string) => ({
      select: (columns?: string) => {
        const chainable = {
          eq: (column: string, value: any) => {
            const queryChain = {
              eq: (col2: string, val2: any) => ({
                maybeSingle: async () => mockResponses[`${table}.maybeSingle`] || { data: null, error: null },
                single: async () => mockResponses[`${table}.single`] || { data: null, error: null },
              }),
              maybeSingle: async () => mockResponses[`${table}.maybeSingle`] || { data: null, error: null },
              single: async () => mockResponses[`${table}.single`] || { data: null, error: null },
            };
            return queryChain;
          },
          limit: (count: number) => ({
            order: () => ({
              data: mockResponses[`${table}.select`] || [],
              error: null,
            }),
          }),
        };
        return chainable;
      },
      insert: async (data: any) => mockResponses[`${table}.insert`] || { data: null, error: null },
      update: (data: any) => ({
        eq: async (column: string, value: any) => mockResponses[`${table}.update`] || { data: null, error: null },
      }),
      delete: () => ({
        eq: async (column: string, value: any) => mockResponses[`${table}.delete`] || { data: null, error: null },
      }),
    }),
    auth: {
      getUser: async (token: string) => mockResponses['auth.getUser'] || { 
        data: { user: null }, 
        error: null 
      },
    },
    rpc: async (fn: string, params?: any) => mockResponses[`rpc.${fn}`] || { data: null, error: null },
  };
}

export function createMockStripe(mockResponses: Record<string, any>) {
  return {
    customers: {
      list: async (params: any) => mockResponses['customers.list'] || { data: [] },
      search: async (params: any) => mockResponses['customers.search'] || { data: [] },
    },
    invoices: {
      retrieve: async (id: string) => mockResponses[`invoices.retrieve.${id}`] || mockResponses['invoices.retrieve'] || null,
      search: async (params: any) => mockResponses['invoices.search'] || { data: [] },
    },
    refunds: {
      create: async (params: any) => mockResponses['refunds.create'] || {
        id: 're_mock123',
        amount: params.amount || 5000,
        currency: 'usd',
        status: 'succeeded',
      },
    },
    subscriptions: {
      list: async (params: any) => mockResponses['subscriptions.list'] || { data: [] },
    },
  };
}

export function createMockRequest(body: any, headers: Record<string, string> = {}) {
  return new Request('http://localhost', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer mock-token',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

export function createMockResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function assertResponseSuccess(response: Response) {
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Expected success but got error: ${JSON.stringify(error)}`);
  }
}

export async function assertResponseError(response: Response, expectedMessage?: string) {
  if (response.ok) {
    throw new Error('Expected error response but got success');
  }
  
  if (expectedMessage) {
    const error = await response.json();
    if (!error.error || !error.error.includes(expectedMessage)) {
      throw new Error(`Expected error message to include "${expectedMessage}" but got: ${error.error}`);
    }
  }
}
