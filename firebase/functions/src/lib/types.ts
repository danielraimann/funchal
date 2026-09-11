export type Proposal = { id: string; number: string; name: string; date: string; operation: string; months: string; amount: number | null; contract: string };
export type CreditDocument = { id: string; date: string; type: string; description: string; downloadable: boolean };
export type CreditDetail = { stage: number | null; status: string; documents: CreditDocument[]; history: { date: string; text: string; author: string }[]; historyAllowed: boolean; updatedAt: string };
export type Connection = { state: "disconnected" | "code" | "connected"; message?: string; proposals?: Proposal[] };
export type DocumentChoice = { id:string; label:string };
export type DocumentChecklistRow = {
  groupId:string;
  typeId:string;
  baseTypeId:string;
  title:string;
  instructions:string;
  complement:string;
  attachedCount:number|null;
  status:"sem anexo"|"anexado"|null;
};
export type DocumentChecklist = {
  state:"available"|"unavailable";
  groups:DocumentChoice[];
  groupId:string;
  rows:DocumentChecklistRow[];
  explanation:string;
};
export type DocumentWorkspace = { uploadAllowed:boolean; groups:DocumentChoice[]; types:DocumentChoice[]; groupId:string; maxFileBytes:number; checklist:{state:"unavailable"; explanation:string}; };
export type DocumentNotes = {available:boolean; entries:{date:string;text:string;source:string}[]; explanation:string; incomplete?:boolean};
export type UploadResult = {state:"confirmed"|"uncertain"; message:string};
