export type SciJson = {
  [country: string]: {
    dates: string[];
    sci: (number | null)[];
    sp: (number | null)[];
    moodys: (number | null)[];
    fitch: (number | null)[];
  };
};

export type MarketJson = {
  [country: string]: {
    dates: string[];
    sci: (number | null)[];
    market_implied: (number | null)[];
    divergence: (number | null)[];
    cds: (number | null)[];
  };
};

export type SnapshotEntry = {
  country: string;
  id?: string;
  flag?: string;
  sci: number | null;
  sci_date: string;
  market_implied: number | null;
  spread: number | null;
  market_date: string | null;
};

export type SnapshotJson = SnapshotEntry[];

export type RatingsJson = {
  [country: string]: {
    latest: {
      "S&P": { rating: string; outlook: string; date: string } | null;
      "Moody's": { rating: string; outlook: string; date: string } | null;
      "Fitch": { rating: string; outlook: string; date: string } | null;
    };
    history: Array<{
      Agency: string;
      Rating: string;
      Outlook: string;
      Date: string;
    }>;
  };
};

export type HierarchyRow = {
  grade_group: string;
  description: string;
  sp: string;
  moodys: string;
  fitch: string;
};

export type HierarchyJson = HierarchyRow[];

export type MetaJson = {
  last_updated: string;
  n_countries_sci: number;
  n_countries_market: number;
  regression: {
    slope: number | null;
    r2_within: number | null;
    r2_overall: number | null;
    intercepts: { [country: string]: number };
  };
};
