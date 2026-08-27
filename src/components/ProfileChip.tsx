import Chip from './Chip'

const PROFILE_META: Record<'floor' | 'upside' | 'balanced', { label: string; tone: 'good' | 'warn' | 'accent' }> = {
  floor: { label: 'SAFE FLOOR', tone: 'good' },
  upside: { label: 'HIGH UPSIDE', tone: 'warn' },
  balanced: { label: 'BALANCED', tone: 'accent' },
}

export default function ProfileChip({ profile }: { profile: 'floor' | 'upside' | 'balanced' }) {
  const meta = PROFILE_META[profile]
  return <Chip tone={meta.tone}>{meta.label}</Chip>
}
