export const extractRecordCandidatesPrompt = `Extract candidate health records from a clinical document. Return JSON only:
{
  "medications": [{"name":"", "dosage":"", "frequency":"", "indication":"", "startDate":"YYYY-MM-DD"}],
  "conditions": [{"name":"", "severity":"mild|moderate|severe", "onsetDate":"YYYY-MM-DD", "notes":""}],
  "encounters": [{"type":"checkup|specialist|urgent_care|emergency|telehealth|lab_visit|imaging|dental|therapy|other", "encounterDate":"YYYY-MM-DD", "provider":"", "facility":"", "chiefComplaint":"", "presentIllness":"", "pastHistory":"", "physicalExam":"", "advice":"", "summary":""}]
}
For outpatient or clinical notes, extract the document's own sections where possible: chiefComplaint=主诉, presentIllness=现病史, pastHistory=既往史, physicalExam=体征与体格检查, advice=医嘱与建议. Copy each section's wording from the document; "summary" should only be a brief synthesis in Chinese. Diagnoses (西医诊断/初步诊断) go to top-level conditions; prescriptions (处方/Rp) go to top-level medications. Only include explicitly documented facts. Omit uncertain fields and omit any record without its required name or encounterDate. These are candidates for human review, not clinical conclusions.`;
