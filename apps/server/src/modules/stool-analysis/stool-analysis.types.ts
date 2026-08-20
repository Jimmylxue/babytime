export type StoolRiskLevel = 'normal' | 'observe' | 'medical_attention' | 'urgent' | 'unknown';

export interface StoolAnalysisResult {
  stoolDetected: boolean;
  imageQuality: 'clear' | 'unclear' | 'not_stool';
  riskLevel: StoolRiskLevel;
  summary: string;
  observedFeatures: {
    color: string;
    consistency: string;
    visibleFindings: string[];
  };
  concerns: string[];
  guidance: string[];
  redFlags: string[];
  confidence: 'low' | 'medium' | 'high';
  disclaimer: string;
}
