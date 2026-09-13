/** A transaction-capable store with rollback and failures at the commit boundary. */
export class InMemoryDatabaseTransactions {
	rows: string[] = [];
	readonly commitFailures: Error[] = [];
	async transaction<T>(
		work: (transaction: InMemoryDatabaseTransactions) => Promise<T>
	): Promise<T> {
		const before = [...this.rows];
		try {
			const result = await work(this);
			const failure = this.commitFailures.shift();
			if (failure) throw failure;
			return result;
		} catch (error) {
			this.rows = before;
			throw error;
		}
	}
}
