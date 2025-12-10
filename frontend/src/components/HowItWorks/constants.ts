export const LAYER_COLORS = {
  Physical: '#FF6B35',
  Functional: '#00E5FF',
  Abstract: '#9C27B0',
  Social: '#4CAF50'
} as const;

export type LayerName = keyof typeof LAYER_COLORS;

export interface TraitEvaluation {
  bit: number;
  name: string;
  applicable: boolean;
  explanation: string;
}

export interface LayerData {
  hex: string;
  binary: string;
  traits: TraitEvaluation[];
}

// Using correct smartphone classification: D6FE701D
export const EXAMPLE_ENTITY = {
  name: 'Smartphone',
  description: 'A portable electronic device that combines mobile phone and computing capabilities',
  uht_code: 'D6FE701D',
  layers: {
    Physical: {
      hex: 'D6',
      binary: '11010110',
      traits: [
        { bit: 1, name: 'Physical Object', applicable: true, explanation: 'You can hold it in your hand' },
        { bit: 2, name: 'Synthetic', applicable: true, explanation: 'Made from manufactured materials like plastic and metal' },
        { bit: 3, name: 'Biological/Biomimetic', applicable: false, explanation: 'Not a living thing or bio-inspired' },
        { bit: 4, name: 'Powered', applicable: true, explanation: 'Requires electrical power to operate' },
        { bit: 5, name: 'Structural', applicable: false, explanation: 'Not primarily load-bearing' },
        { bit: 6, name: 'Observable', applicable: true, explanation: 'Can be seen and measured' },
        { bit: 7, name: 'Physical Medium', applicable: true, explanation: 'Made of physical materials' },
        { bit: 8, name: 'Active', applicable: false, explanation: 'Does not move autonomously' }
      ]
    },
    Functional: {
      hex: 'FE',
      binary: '11111110',
      traits: [
        { bit: 9, name: 'Intentionally Designed', applicable: true, explanation: 'Carefully engineered with specific purpose' },
        { bit: 10, name: 'Outputs Effect', applicable: true, explanation: 'Produces light, sound, and information' },
        { bit: 11, name: 'Processes Signals/Logic', applicable: true, explanation: 'Runs apps and processes data' },
        { bit: 12, name: 'State-Transforming', applicable: true, explanation: 'Changes internal state based on inputs' },
        { bit: 13, name: 'Human-Interactive', applicable: true, explanation: 'Designed for human touch and use' },
        { bit: 14, name: 'System-integrated', applicable: true, explanation: 'Part of cellular and internet networks' },
        { bit: 15, name: 'Functionally Autonomous', applicable: true, explanation: 'Can run background processes independently' },
        { bit: 16, name: 'System-Essential', applicable: false, explanation: 'Not essential to larger system operation' }
      ]
    },
    Abstract: {
      hex: '70',
      binary: '01110000',
      traits: [
        { bit: 17, name: 'Symbolic', applicable: false, explanation: 'Device itself is not symbolic' },
        { bit: 18, name: 'Signalling', applicable: true, explanation: 'Transmits information and meaning' },
        { bit: 19, name: 'Rule-governed', applicable: true, explanation: 'Operates according to software rules and protocols' },
        { bit: 20, name: 'Compositional', applicable: true, explanation: 'Made up of many layered components' },
        { bit: 21, name: 'Normative', applicable: false, explanation: 'Does not direct behavior' },
        { bit: 22, name: 'Meta', applicable: false, explanation: 'Not self-referential' },
        { bit: 23, name: 'Temporal', applicable: false, explanation: 'Not primarily about time' },
        { bit: 24, name: 'Digital/Virtual', applicable: false, explanation: 'Physical device, though runs digital software' }
      ]
    },
    Social: {
      hex: '1D',
      binary: '00011101',
      traits: [
        { bit: 25, name: 'Social Construct', applicable: false, explanation: 'Physical object, not social construct' },
        { bit: 26, name: 'Institutionally Defined', applicable: false, explanation: 'Not formally defined by institutions' },
        { bit: 27, name: 'Identity-Linked', applicable: false, explanation: 'Personal but not role-defining' },
        { bit: 28, name: 'Regulated', applicable: true, explanation: 'Subject to telecom regulations and standards' },
        { bit: 29, name: 'Economically Significant', applicable: true, explanation: 'Major global industry worth billions' },
        { bit: 30, name: 'Politicised', applicable: true, explanation: 'Subject to political debates and policies' },
        { bit: 31, name: 'Ritualised', applicable: false, explanation: 'Not associated with formal rituals' },
        { bit: 32, name: 'Ethically Significant', applicable: true, explanation: 'Raises privacy and social concerns' }
      ]
    }
  }
} as const;
