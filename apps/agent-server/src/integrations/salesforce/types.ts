export interface SalesforceContact {
  Id: string;
  Name: string;
  Email: string;
  Title: string;
  AccountId: string;
  Account: {
    Id: string;
    Name: string;
    Industry: string;
    NumberOfEmployees: number;
  };
  LeadSource: string;
  Status__c: string;
}

export interface SalesforceOpportunity {
  Id: string;
  Name: string;
  AccountId: string;
  StageName: string;
  Amount: number;
  CloseDate: string;
}
