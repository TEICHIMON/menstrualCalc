import Papa from 'papaparse'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import type { Period } from './cycle'

dayjs.extend(customParseFormat)

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data as string[][]
        if (rows.length === 0) {
          reject(new Error('CSV 文件为空'))
          return
        }
        resolve({ headers: rows[0].map((h) => h.trim()), rows: rows.slice(1) })
      },
      error: (err: Error) => reject(err),
    })
  })
}

const DATE_FORMATS = [
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'YYYY/M/D',
  'YYYY.MM.DD',
  'YYYYMMDD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY/MM/DD HH:mm:ss',
]

/** 尽力把各种常见写法解析为 YYYY-MM-DD；毫秒/秒时间戳也支持 */
export function normalizeDate(raw: string): string | null {
  const value = raw.trim().replace(/"/g, '')
  if (!value) return null

  if (/^\d{13}$/.test(value)) return dayjs(Number(value)).format('YYYY-MM-DD')
  if (/^\d{10}$/.test(value)) return dayjs(Number(value) * 1000).format('YYYY-MM-DD')

  for (const f of DATE_FORMATS) {
    const d = dayjs(value, f, true)
    if (d.isValid()) return d.format('YYYY-MM-DD')
  }
  const loose = dayjs(value)
  return loose.isValid() ? loose.format('YYYY-MM-DD') : null
}

export interface MappedRow {
  start_date: string
  end_date: string | null
}

/** 按用户选择的列，把 CSV 行映射成经期记录；返回成功与失败的行 */
export function mapRows(
  rows: string[][],
  startCol: number,
  endCol: number | null,
): { ok: MappedRow[]; failed: number } {
  const ok: MappedRow[] = []
  let failed = 0
  for (const row of rows) {
    const start = normalizeDate(row[startCol] ?? '')
    if (!start) {
      failed++
      continue
    }
    let end: string | null = null
    if (endCol !== null) {
      end = normalizeDate(row[endCol] ?? '')
      if (end && end < start) end = null
    }
    ok.push({ start_date: start, end_date: end })
  }
  // 同一开始日只保留一条
  const seen = new Set<string>()
  return {
    ok: ok.filter((r) => (seen.has(r.start_date) ? false : (seen.add(r.start_date), true))),
    failed,
  }
}

export interface WorkoutCols {
  date: number
  duration: number
  /** 时长列的单位 */
  durationUnit: 'seconds' | 'minutes'
  mode: number | null
  hr: number | null
  calories: number | null
}

export interface MappedWorkout {
  date: string
  mode: string
  duration_min: number
  avg_hr: number | null
  calories: number | null
}

/** 尽力解析数字（容忍 "1,234"、"56 千卡" 这类写法） */
function looseNumber(raw: string | undefined): number | null {
  if (!raw) return null
  const m = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/** 按用户选择的列，把 CSV 行映射成锻炼记录；返回成功与失败的行 */
export function mapWorkoutRows(
  rows: string[][],
  cols: WorkoutCols,
): { ok: MappedWorkout[]; failed: number } {
  const ok: MappedWorkout[] = []
  let failed = 0
  for (const row of rows) {
    const date = normalizeDate(row[cols.date] ?? '')
    const rawDuration = looseNumber(row[cols.duration])
    const durationMin =
      rawDuration === null
        ? null
        : Math.round(cols.durationUnit === 'seconds' ? rawDuration / 60 : rawDuration)
    if (!date || !durationMin || durationMin <= 0 || durationMin > 1440) {
      failed++
      continue
    }
    const hr = cols.hr === null ? null : looseNumber(row[cols.hr])
    const cal = cols.calories === null ? null : looseNumber(row[cols.calories])
    ok.push({
      date,
      mode: (cols.mode === null ? '' : (row[cols.mode] ?? '').trim()) || '其他',
      duration_min: durationMin,
      avg_hr: hr !== null && hr >= 30 && hr <= 250 ? Math.round(hr) : null,
      calories: cal !== null && cal >= 0 && cal <= 10000 ? Math.round(cal) : null,
    })
  }
  return { ok, failed }
}

export function exportPeriodsCsv(periods: Period[]) {
  const csv = Papa.unparse({
    fields: ['start_date', 'end_date', 'source', 'note'],
    data: periods.map((p) => [p.start_date, p.end_date ?? '', p.source ?? 'manual', p.note ?? '']),
  })
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `periods-${dayjs().format('YYYY-MM-DD')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
