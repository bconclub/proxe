// Brand-private: this brand's Flows automation. Empty until configured — add the
// brand's triggers/sequences here (FlowsAutomation renders them).
export type Trigger = { id: string; icon: any; event: string; when: string; template: string | null; desc: string }
export type Step = { label: string; delay: string; template: string }
export type Sequence = { id: string; segment: string; who: string; stop: string; gated?: boolean; steps: Step[] }
export const TRIGGERS: Trigger[] = []
export const SEQUENCES: Sequence[] = []
