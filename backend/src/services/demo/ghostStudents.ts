import type { EvaluationCategory } from "../../schemas/ai.js"

export interface GhostStudent {
  id: string
  name: string
  status: 'ok' | 'flagged'
  progressPercent: number
  flagReason: string | null
  flagCategory: EvaluationCategory | null
  confusionHighlights: string[]
  lastCheckedAt: Date
}

export class GhostStudentService {
  private tick = 0
  private intervalId: ReturnType<typeof setInterval> | null = null
  // Tracks the tick at which each student last changed state, for stable lastCheckedAt
  private readonly stateChangedAt = new Map<string, Date>()

  constructor() {
    const start = new Date()
    for (const id of ['ghost-alex','ghost-maya','ghost-jordan','ghost-sam','ghost-riley','ghost-casey','ghost-drew']) {
      this.stateChangedAt.set(id, start)
    }
    this.intervalId = setInterval(() => {
      const now = new Date()
      const prev = this.tick
      this.tick++
      const t = this.tick
      // Update stateChangedAt only for students whose state actually changes this tick
      if (prev < 2 && t >= 2) this.stateChangedAt.set('ghost-drew', now)
      if (prev < 3 && t >= 3) this.stateChangedAt.set('ghost-maya', now)
      if (prev < 5 && t >= 5) this.stateChangedAt.set('ghost-jordan', now)
      if (prev < 7 && t >= 7) this.stateChangedAt.set('ghost-riley', now)
      // ok-only students: update every tick so lastCheckedAt stays fresh
      this.stateChangedAt.set('ghost-alex', now)
      this.stateChangedAt.set('ghost-sam', now)
      this.stateChangedAt.set('ghost-casey', now)
    }, 8000)
  }

  private ts(id: string): Date {
    return this.stateChangedAt.get(id) ?? new Date()
  }

  getAll(): GhostStudent[] {
    const t = this.tick

    // Alex Kim — ok always; progress rises
    const alex: GhostStudent = {
      id: 'ghost-alex',
      name: 'Alex Kim',
      status: 'ok',
      progressPercent: t === 0 ? 10 : t === 1 ? 25 : t === 2 ? 40 : t === 3 ? 60 : 80,
      flagReason: null,
      flagCategory: null,
      confusionHighlights: [],
      lastCheckedAt: this.ts('ghost-alex'),
    }

    // Maya Patel — ok at tick 0-2; flagged tick 3+
    const mayaFlagged = t >= 3
    const maya: GhostStudent = {
      id: 'ghost-maya',
      name: 'Maya Patel',
      status: mayaFlagged ? 'flagged' : 'ok',
      progressPercent: 40,
      flagReason: mayaFlagged ? 'Stuck: no progress for 3+ minutes' : null,
      flagCategory: mayaFlagged ? 'stuck' : null,
      confusionHighlights: mayaFlagged ? ['Has not advanced past current step'] : [],
      lastCheckedAt: this.ts('ghost-maya'),
    }

    // Jordan Lee — ok at tick 0-4; flagged tick 5+
    const jordanFlagged = t >= 5
    const jordan: GhostStudent = {
      id: 'ghost-jordan',
      name: 'Jordan Lee',
      status: jordanFlagged ? 'flagged' : 'ok',
      progressPercent: jordanFlagged ? 60 : (t === 0 ? 10 : t === 1 ? 25 : t === 2 ? 40 : t === 3 ? 55 : 60),
      flagReason: jordanFlagged
        ? 'Off track: wrong operation in step 2 — multiplying instead of dividing both sides by 3'
        : null,
      flagCategory: jordanFlagged ? 'wrong-approach' : null,
      confusionHighlights: jordanFlagged
        ? ['Step 2: multiplied instead of divided', 'Expected: divide both sides by 3 → x = 7']
        : [],
      lastCheckedAt: this.ts('ghost-jordan'),
    }

    // Sam Chen — ok always; progress rises then holds
    const sam: GhostStudent = {
      id: 'ghost-sam',
      name: 'Sam Chen',
      status: 'ok',
      progressPercent: t === 0 ? 15 : t === 1 ? 35 : t === 2 ? 55 : 55,
      flagReason: null,
      flagCategory: null,
      confusionHighlights: [],
      lastCheckedAt: this.ts('ghost-sam'),
    }

    // Riley Johnson — ok at tick 0-6; flagged tick 7+
    const rileyFlagged = t >= 7
    const riley: GhostStudent = {
      id: 'ghost-riley',
      name: 'Riley Johnson',
      status: rileyFlagged ? 'flagged' : 'ok',
      progressPercent: rileyFlagged ? 70 : (t === 0 ? 10 : t === 1 ? 25 : t === 2 ? 40 : t === 3 ? 55 : t === 4 ? 65 : t === 5 ? 70 : 70),
      flagReason: rileyFlagged
        ? 'Calculation error: arithmetic mistake in step 1 — got 3x = 11 instead of 3x = 21'
        : null,
      flagCategory: rileyFlagged ? 'calc-error' : null,
      confusionHighlights: rileyFlagged
        ? ['Step 1: subtracted 5 instead of adding', 'Got 3x = 11 but expected 3x = 21']
        : [],
      lastCheckedAt: this.ts('ghost-riley'),
    }

    // Casey Brown — ok always; progress rises then holds
    const casey: GhostStudent = {
      id: 'ghost-casey',
      name: 'Casey Brown',
      status: 'ok',
      progressPercent: t === 0 ? 20 : t === 1 ? 45 : t === 2 ? 70 : 70,
      flagReason: null,
      flagCategory: null,
      confusionHighlights: [],
      lastCheckedAt: this.ts('ghost-casey'),
    }

    // Drew Wilson — ok at tick 0-1; flagged tick 2+
    const drewFlagged = t >= 2
    const drew: GhostStudent = {
      id: 'ghost-drew',
      name: 'Drew Wilson',
      status: drewFlagged ? 'flagged' : 'ok',
      progressPercent: drewFlagged ? 20 : (t === 0 ? 10 : 20),
      flagReason: drewFlagged
        ? 'Off topic: not working on the assigned problem'
        : null,
      flagCategory: drewFlagged ? 'off-topic' : null,
      confusionHighlights: drewFlagged
        ? ['Visible work unrelated to 3x - 5 = 16']
        : [],
      lastCheckedAt: this.ts('ghost-drew'),
    }

    return [alex, maya, jordan, sam, riley, casey, drew]
  }

  destroy() {
    if (this.intervalId) clearInterval(this.intervalId)
  }
}
