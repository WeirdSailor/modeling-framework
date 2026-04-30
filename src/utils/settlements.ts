// SP n starts at (n-1)*30 minutes from midnight
// Returns "HH:MM" string
export function spToTime(sp: number): string {
  if (sp < 1 || sp > 48 || !Number.isInteger(sp)) {
    throw new RangeError(`Settlement period must be an integer 1–48, got ${sp}`)
  }
  const totalMinutes = (sp - 1) * 30
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

// Returns ISO datetime string for the start of SP n on the given date (YYYY-MM-DD)
/**
 * @param sp - Settlement period (1-48)
 * @param date - YYYY-MM-DD settlement date. The returned ISO string uses UTC offset (Z suffix).
 *   In BST (UTC+1), SP 1 starts at T23:00Z the prior day — callers must account for this if
 *   precise UTC times are needed.
 */
export function spToStartTime(sp: number, date: string): string {
  if (sp < 1 || sp > 48 || !Number.isInteger(sp)) {
    throw new RangeError(`Settlement period must be an integer 1–48, got ${sp}`)
  }
  const totalMinutes = (sp - 1) * 30
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000Z`
}

// Returns the SP number (1-48) that the given Date falls in
export function dateToSp(date: Date): number {
  const hours = date.getUTCHours()
  const minutes = date.getUTCMinutes()
  const totalMinutes = hours * 60 + minutes
  return Math.floor(totalMinutes / 30) + 1
}

// Returns the settlement date string (YYYY-MM-DD) for a given Date
// Note: settlement date rolls over at midnight
export function dateToSettlementDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Returns the start Date object for SP n on the given settlement date
/**
 * @param sp - Settlement period (1-48)
 * @param settlementDate - YYYY-MM-DD settlement date. The returned ISO string uses UTC offset (Z suffix).
 *   In BST (UTC+1), SP 1 starts at T23:00Z the prior day — callers must account for this if
 *   precise UTC times are needed.
 */
export function spToDate(sp: number, settlementDate: string): Date {
  if (sp < 1 || sp > 48 || !Number.isInteger(sp)) {
    throw new RangeError(`Settlement period must be an integer 1–48, got ${sp}`)
  }
  const totalMinutes = (sp - 1) * 30
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return new Date(
    `${settlementDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000Z`
  )
}

// Returns array of {sp, label} for all 48 SPs, where label = "HH:MM"
export function getAllSpLabels(): Array<{ sp: number; label: string }> {
  return Array.from({ length: 48 }, (_, i) => ({
    sp: i + 1,
    label: spToTime(i + 1),
  }))
}
