export const extractRecordCandidatesPrompt = `Extract candidate health records from a clinical document. Return JSON only:
{
  "medications": [{"name":"", "dosage":"", "frequency":"", "indication":"", "startDate":"YYYY-MM-DD"}],
  "conditions": [{"name":"", "severity":"mild|moderate|severe", "onsetDate":"YYYY-MM-DD", "notes":""}],
  "encounters": [{"type":"checkup|specialist|urgent_care|emergency|telehealth|lab_visit|imaging|dental|therapy|other", "encounterDate":"YYYY-MM-DD", "provider":"", "facility":"", "chiefComplaint":"", "summary":""}]
}
Only include explicitly documented facts. Omit uncertain fields and omit any record without its required name or encounterDate. These are candidates for human review, not clinical conclusions.`;
