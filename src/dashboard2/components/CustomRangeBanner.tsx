import { formatDayDateTime, formatHHMM, sameLondonDay } from '../time'
import styles from '../dashboard2.module.css'

interface Props { startMs: number; endMs: number; onBackToLive: () => void }

export default function CustomRangeBanner({ startMs, endMs, onBackToLive }: Props) {
  // End is exclusive; show it as a clock time on the same day when it falls on that day (or its midnight).
  const endLabel = sameLondonDay(startMs, endMs - 1) ? formatHHMM(endMs) : formatDayDateTime(endMs)
  return (
    <div className={styles.banner}>
      <span>Viewing <b>{formatDayDateTime(startMs)}</b> to <b>{endLabel}</b></span>
      <button type="button" className={styles.btn} onClick={onBackToLive}>Back to live</button>
    </div>
  )
}
