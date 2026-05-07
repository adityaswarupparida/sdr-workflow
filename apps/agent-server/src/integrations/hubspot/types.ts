export interface HubSpotContact {
  id: string;
  properties: {
    firstname: string;
    lastname: string;
    email: string;
    company: string;
    jobtitle: string;
    lifecyclestage: string;
  };
}

export interface HubSpotDeal {
  id: string;
  properties: {
    dealname: string;
    dealstage: string;
    amount: string;
    closedate: string;
  };
}

export interface HubSpotActivity {
  id: string;
  type: "EMAIL";
  properties: {
    hs_email_subject: string;
    hs_email_text: string;
    hs_timestamp: string;
  };
}
