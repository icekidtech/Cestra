export interface CsvRow {
  'Recipient Name': string;
  Country: string;
  'Mobile Money Type': string;
  'Account Number': string;
  'Amount (USD)': string;
}

export interface CsvRowError {
  row: number;
  errors: string[];
}
