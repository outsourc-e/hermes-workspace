import { useEffect, useRef } from 'react'
import { bidiClassNameFor, textDirectionFor } from '../../../lib/war-room/living-v3/bidi-text'
import type { CSSProperties } from 'react'

export type CouncilGroupChatStage = 'discussion' | 'team-selection' | 'plan-drafting' | 'ready-for-hermes'

export type CouncilGroupChatMember = {
  id: string
  name: string
  personaLabel: string
  memoryLine?: string
  statLine?: string
  isChair?: boolean
  accent: string
  portraitUrl: string
  voteLabel: string
  voteTone: 'support' | 'neutral' | 'against' | 'abstain' | 'pending'
  selectedForPlanning: boolean
  answered: boolean
}

export type CouncilGroupChatMessage = {
  id: string
  senderType: 'operator' | 'general'
  senderId: string
  senderName: string
  portraitUrl?: string
  accent?: string
  text: string
  timeLabel?: string
  voteLabel?: string
  voteTone?: 'support' | 'neutral' | 'against' | 'abstain'
  replyTo?: string
  replySnippet?: string
  failed?: boolean
  phaseLabel?: string
}

type CouncilGroupChatWorkbenchProps = {
  sessionActive: boolean
  topic: string
  members: Array<CouncilGroupChatMember>
  messages: Array<CouncilGroupChatMessage>
  pendingMember?: CouncilGroupChatMember | null
  running: boolean
  stage: CouncilGroupChatStage
  composerValue: string
  summaryTitle: string
  summaryBody: string
  voteLine: string
  handoffSent: boolean
  onComposerChange: (value: string) => void
  onSendToCouncil: () => void
  onOpenAdvisor: (memberId: string) => void
  onBeginTeamSelection: () => void
  onTogglePlanningMember: (memberId: string) => void
  onRequestPlan: () => void
  onContinueDiscussion: () => void
  onSendToHermes: () => void
}

function AnimatedCouncilText({ text }: { text: string }) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return (
    <span
      className={`council-group-chat__animated-text ${bidiClassNameFor(text)}`}
      dir={textDirectionFor(text)}
      data-council-word-reveal="true"
    >
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          style={{ '--word-delay': `${Math.min(index * 28, 520)}ms` } as CSSProperties}
        >
          {word}{index < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  )
}

function MemberAvatar({ member, compact = false }: { member: CouncilGroupChatMember; compact?: boolean }) {
  return (
    <span
      className={`council-group-chat__member-avatar ${compact ? 'is-compact' : ''}`}
      style={{ '--member-accent': member.accent, backgroundImage: `url("${member.portraitUrl}")` } as CSSProperties}
      aria-hidden="true"
    />
  )
}

export function CouncilGroupChatWorkbench({
  sessionActive,
  topic,
  members,
  messages,
  pendingMember,
  running,
  stage,
  composerValue,
  summaryTitle,
  summaryBody,
  voteLine,
  handoffSent,
  onComposerChange,
  onSendToCouncil,
  onOpenAdvisor,
  onBeginTeamSelection,
  onTogglePlanningMember,
  onRequestPlan,
  onContinueDiscussion,
  onSendToHermes,
}: CouncilGroupChatWorkbenchProps) {
  const threadRef = useRef<HTMLDivElement | null>(null)
  const selectedMembers = members.filter((member) => member.selectedForPlanning)
  const completed = sessionActive && !running && members.some((member) => member.answered)

  useEffect(() => {
    const node = threadRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages.length, pendingMember?.id, running, stage])

  return (
    <section
      className="council-group-chat"
      data-council-group-chat="primary-v1"
      data-council-group-session={sessionActive ? 'active' : 'start'}
      data-council-group-stage={stage}
      data-council-group-running={running ? 'true' : 'false'}
      dir="rtl"
      aria-label="שיחת קבוצת מועצת הגנרלים"
    >
      <header className="council-group-chat__header">
        <div className="council-group-chat__identity">
          <div className="council-group-chat__avatar-stack" aria-hidden="true">
            {members.slice(0, 4).map((member) => <MemberAvatar key={member.id} member={member} compact />)}
          </div>
          <div>
            <span>קבוצת עבודה</span>
            <h3>מועצת הגנרלים</h3>
            <p>{running ? `${pendingMember?.name ?? 'המועצה'} כותב עכשיו…` : `יוליוס ראש המועצה · ${members.length - 1} יועצים עצמאיים · זיכרון קצר לכל פרופיל`}</p>
          </div>
        </div>
        <div className="council-group-chat__presence" aria-label="חברי הקבוצה והשיחות הפרטיות">
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              className={`is-${member.voteTone}`}
              onClick={() => onOpenAdvisor(member.id)}
              disabled={!sessionActive}
              title={sessionActive ? `פתח שיחה אישית עם ${member.name} · ${member.memoryLine ?? member.personaLabel}` : 'פרטי נפתח אחרי תשובת הגנרל'}
              aria-label={sessionActive ? `פתח פרטי עם ${member.name}` : `פרטי עם ${member.name} ייפתח אחרי תשובה ראשונה`}
              data-council-group-member={member.id}
              data-council-chair-member={member.isChair ? 'true' : 'false'}
              data-council-profile-memory={member.memoryLine ?? ''}
              data-council-private-advisor-entry="visible"
              data-council-private-advisor-state={sessionActive ? 'ready' : 'wait-for-first-answer'}
            >
              <MemberAvatar member={member} compact />
              <span className="council-group-chat__presence-name">{member.name}{member.isChair ? ' · יו״ר' : ''}</span>
              <span className="council-group-chat__private-pill">{member.statLine ?? 'פרטי'}</span>
              <i aria-label={member.answered ? member.voteLabel : 'ממתין'} />
            </button>
          ))}
        </div>
      </header>

      <div className="council-group-chat__thread" ref={threadRef} aria-live="polite" aria-relevant="additions text">
        {sessionActive ? (
          <article className="council-group-chat__message is-operator" data-council-group-message="operator-topic">
            <span className="council-group-chat__operator-avatar" aria-hidden="true">DLV</span>
            <div className="council-group-chat__bubble">
              <div className="council-group-chat__meta"><b>אתה</b><span>נשלח למועצה ✓✓</span></div>
              <p className={bidiClassNameFor(topic)} dir={textDirectionFor(topic)}>{topic}</p>
            </div>
          </article>
        ) : (
          <section className="council-group-chat__start" data-council-group-start="canonical" aria-label="פתיחת דיון חדש">
            <div className="council-group-chat__start-portraits" aria-hidden="true">
              {members.map((member) => <MemberAvatar key={member.id} member={member} />)}
            </div>
            <span>ששת הגנרלים מחכים</span>
            <h4>על מה תרצה להתייעץ?</h4>
            <p>כתוב מטרה, התלבטות או החלטה. כל גנרל יענה מהפרופיל העצמאי שלו, והשיחה תישאר כאן.</p>
          </section>
        )}

        {messages.map((message) => {
          if (message.senderType === 'operator') {
            return (
              <article key={message.id} className="council-group-chat__message is-operator" data-council-group-message="operator-follow-up">
                <span className="council-group-chat__operator-avatar" aria-hidden="true">DLV</span>
                <div className="council-group-chat__bubble">
                  <div className="council-group-chat__meta"><b>אתה</b><span>{message.timeLabel ?? 'נכנס לדיון ✓✓'}</span></div>
                  <AnimatedCouncilText text={message.text} />
                </div>
              </article>
            )
          }
          return (
            <article
              key={message.id}
              className={`council-group-chat__message is-general is-${message.voteTone ?? 'neutral'} ${message.failed ? 'is-failed' : ''}`}
              style={{ '--member-accent': message.accent ?? '#94a3b8' } as CSSProperties}
              data-council-group-message={message.senderId}
              data-council-message-status={message.failed ? 'failed-cleaned' : 'real-profile-answer'}
            >
              <button type="button" className="council-group-chat__portrait-button" onClick={() => onOpenAdvisor(message.senderId)} aria-label={`פתח שיחה עם ${message.senderName}`}>
                <span style={{ backgroundImage: `url("${message.portraitUrl ?? ''}")` }} aria-hidden="true" />
              </button>
              <button type="button" className="council-group-chat__bubble" onClick={() => onOpenAdvisor(message.senderId)}>
                <span className="council-group-chat__meta"><b>{message.senderName}</b><span>{message.phaseLabel ?? message.voteLabel}</span></span>
                {message.replyTo && (
                  <span className="council-group-chat__reply">↪ {message.replyTo}<small>{message.replySnippet}</small></span>
                )}
                <AnimatedCouncilText text={message.text} />
                <span className="council-group-chat__message-foot"><em>{message.failed ? 'לא נספר' : message.voteLabel}</em><span className="council-group-chat__message-private-cta">פתח פרטי</span></span>
              </button>
            </article>
          )
        })}

        {running && (
          <article className="council-group-chat__message is-typing" data-council-group-message="typing" data-council-typing-member={pendingMember?.id ?? 'council'}>
            {pendingMember ? <MemberAvatar member={pendingMember} /> : <span className="council-group-chat__thinking-avatar" aria-hidden="true">…</span>}
            <div className="council-group-chat__bubble">
              <div className="council-group-chat__meta"><b>{pendingMember?.name ?? 'המועצה'}</b><span>חושב וכותב</span></div>
              <span className="council-group-chat__typing-dots" aria-label="כותב עכשיו"><i /><i /><i /></span>
            </div>
          </article>
        )}

        {completed && (
          <article className="council-group-chat__message is-summary" data-council-group-message="pinned-summary">
            <span className="council-group-chat__summary-avatar" aria-hidden="true">✓</span>
            <div className="council-group-chat__bubble">
              <div className="council-group-chat__meta"><b>סיכום ביניים נעוץ</b><span>{voteLine}</span></div>
              <h4>{summaryTitle}</h4>
              <p>{summaryBody}</p>
              <small>אפשר להמשיך לדבר, לשאול גנרל אחד, או לבחור צוות לפירוק.</small>
            </div>
          </article>
        )}
      </div>

      <footer className="council-group-chat__footer">
        {stage === 'discussion' && (
          <>
            <label className="council-group-chat__composer">
              <span>{sessionActive ? 'הודעה לקבוצה' : 'השאלה הראשונה למועצה'}</span>
              <textarea
                value={composerValue}
                onChange={(event) => onComposerChange(event.target.value)}
                dir="auto"
                placeholder={sessionActive ? 'כתוב תגובה, שאלה או תיקון — הגנרלים הבאים יקראו אותה…' : 'מה אתה רוצה לתכנן, להחליט או לבדוק?'}
              />
            </label>
            <div className="council-group-chat__actions" data-council-primary-actions="chat-and-team">
              <button type="button" className="is-primary" onClick={onSendToCouncil} disabled={!composerValue.trim()} data-council-send-to-group="true">
                {running ? 'הוסף לדיון החי' : sessionActive ? 'שלח לקבוצת המועצה' : 'פתח דיון עם ששת הגנרלים'}
              </button>
              <button
                type="button"
                className="is-team-cta"
                onClick={onBeginTeamSelection}
                disabled={running || !completed}
                data-council-begin-team-selection="true"
                data-council-team-selection-visible="true"
              >
                {completed ? 'בחר צוות פירוק' : 'צוות פירוק ייפתח אחרי הכיוון'}
              </button>
            </div>
          </>
        )}

        {stage === 'team-selection' && (
          <section className="council-group-chat__team-picker" data-council-planning-team-picker="true" aria-label="בחירת גנרלים לפירוק התוכנית">
            <div>
              <span>מי יפרק איתך את התוכנית?</span>
              <b>בחר גנרל אחד או כמה. רק הם יקבלו את סבב הפירוק הבא.</b>
            </div>
            <div className="council-group-chat__team-grid">
              {members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className={member.selectedForPlanning ? 'is-selected' : ''}
                  onClick={() => onTogglePlanningMember(member.id)}
                  aria-pressed={member.selectedForPlanning}
                  data-council-planning-agent={member.id}
                >
                  <MemberAvatar member={member} />
                  <span><b>{member.name}</b><small>{member.personaLabel}</small></span>
                  <i aria-hidden="true">{member.selectedForPlanning ? '✓' : '+'}</i>
                </button>
              ))}
            </div>
            <div className="council-group-chat__actions">
              <button type="button" className="is-primary" onClick={onRequestPlan} disabled={selectedMembers.length === 0} data-council-request-plan="true">
                פרק תוכנית עם {selectedMembers.length || 0} גנרלים
              </button>
              <button type="button" onClick={onContinueDiscussion}>חזור לשיחה</button>
            </div>
          </section>
        )}

        {stage === 'plan-drafting' && (
          <section className="council-group-chat__stage-card is-working" data-council-plan-drafting="true">
            <div className="council-group-chat__avatar-stack" aria-hidden="true">
              {selectedMembers.map((member) => <MemberAvatar key={member.id} member={member} compact />)}
            </div>
            <div><span>צוות הפירוק עובד בצ׳אט</span><b>{selectedMembers.map((member) => member.name).join(' · ')}</b></div>
            <span className="council-group-chat__typing-dots" aria-label="מכינים תוכנית"><i /><i /><i /></span>
          </section>
        )}

        {stage === 'ready-for-hermes' && (
          <section className="council-group-chat__stage-card is-ready" data-council-plan-ready="true">
            <div><span>התוכנית מוכנה לבדיקה</span><b>נבנתה עם {selectedMembers.map((member) => member.name).join(' · ')}</b><small>אפשר לשלוח להרמס כשאתה מוכן.</small></div>
            <div className="council-group-chat__actions">
              <button type="button" className="is-primary" onClick={onSendToHermes} disabled={handoffSent} data-council-handoff-to-hermes="true">{handoffSent ? 'נשלח להרמס' : 'שלח להרמס לקראת ביצוע'}</button>
              <button type="button" onClick={onContinueDiscussion} disabled={handoffSent}>חזור לשיחה</button>
            </div>
          </section>
        )}
      </footer>
    </section>
  )
}
