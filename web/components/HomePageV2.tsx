"use client";

import { useState, Fragment } from 'react'
import Image from 'next/image'
import { SiteNav } from './SiteNav'
import { SiteFooter } from './SiteFooter'

// ─── HERO ────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-hp-ink">
      {/* Background cricket action photo */}
      <Image
        src="/hp/hero.jpg"
        alt=""
        aria-hidden="true"
        fill
        priority={false}
        sizes="100vw"
        className="object-cover object-center opacity-70"
      />
      {/* Dark gradient overlay — keeps text legible */}
      <div className="absolute inset-0 bg-gradient-to-r from-hp-ink/70 via-hp-ink/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-hp-ink/30 via-transparent to-hp-ink/20" />
      <div
        className="absolute inset-0 opacity-100"
        style={{
          backgroundImage: `
            linear-gradient(rgba(232,54,42,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(232,54,42,0.025) 1px, transparent 1px)
          `,
          backgroundSize: '72px 72px',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-hp-ink via-hp-ink/92 to-hp-ink/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-hp-ink via-transparent to-transparent" />

      <div className="relative w-full max-w-[1440px] mx-auto px-8 pt-28 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-20 items-center">
          {/* Copy */}
          <div>
            <div className="flex items-center gap-3 mb-10">
              <span className="block w-8 h-px bg-hp-cg" />
              <span className="font-mono text-[9px] tracking-[0.35em] text-hp-cg uppercase">
                The Digital Cricket Ecosystem
              </span>
            </div>

            <h1
              className="font-display font-black uppercase leading-[0.88] text-hp-paper mb-10"
              style={{ fontSize: 'clamp(64px, 8.5vw, 112px)' }}
            >
              EVERY<br />
              BALL<br />
              TELLS<br />
              A STORY.
            </h1>

            <p className="text-hp-paper/78 text-[17px] leading-relaxed max-w-[490px] mb-4">
              CRIC HQ connects every ball, player, match and pathway - Turning cricket data into insight, development and opportunity.
            </p>
            <p className="font-mono text-[9px] tracking-[0.28em] text-hp-paper/52 uppercase mb-12">
              Players · Coaches · Clubs · Schools · Academies · Organisations
            </p>

            <div className="flex flex-wrap gap-4 items-center">
              <a
                href="/signup"
                className="bg-hp-cg text-hp-paper font-display font-black text-sm px-10 py-4 tracking-[0.15em] uppercase hover:bg-hp-cg/90 transition-colors"
              >
                GET STARTED
              </a>
              <a
                href="#what-is-cric-hq"
                className="border border-white/25 text-hp-paper font-display font-black text-sm px-10 py-4 tracking-[0.15em] uppercase hover:bg-white/4 hover:border-white/40 transition-colors"
              >
                SEE HOW IT WORKS
              </a>
            </div>
          </div>

          {/* Data visualization */}
          <div className="hidden lg:flex flex-col gap-2.5">
            {/* Live match */}
            <div className="border border-white/8 bg-hp-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-mono text-[8px] tracking-widest text-red-400">LIVE MATCH</span>
                </div>
                <span className="font-mono text-[8px] tracking-widest text-hp-paper/72">T20 · GRADE 1</span>
              </div>
              <div className="flex items-baseline gap-3 mb-4">
                <span className="font-display font-black text-5xl text-hp-paper">42</span>
                <span className="font-display font-black text-3xl text-hp-paper/72">/2</span>
                <div className="ml-auto text-right">
                  <div className="font-mono text-[9px] text-hp-paper/82">8.2 OVERS</div>
                  <div className="font-mono text-sm text-hp-paper/82 font-medium">CRR 5.12</div>
                </div>
              </div>
              <div className="flex gap-1.5">
                {['1', 'W', '4', '·', '·', '6', '·', '·'].map((b, i) => (
                  <span
                    key={i}
                    className={`w-7 h-7 flex items-center justify-center font-mono text-[11px] font-bold border ${
                      b === 'W'
                        ? 'border-red-500/45 text-red-400 bg-red-500/8'
                        : b === '4' || b === '6'
                        ? 'border-hp-cg/40 text-hp-cg bg-hp-cg/8'
                        : 'border-white/8 text-hp-paper/78'
                    }`}
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>

            {/* Separator */}
            <div className="flex items-center gap-3 px-2">
              <div className="flex-1 h-px bg-white/5" />
              <span className="font-mono text-[7px] tracking-widest text-hp-paper/85 uppercase">captured</span>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            {/* Card 02 — Ball captured */}
            <div className="border border-white/8 bg-hp-surface p-4">
              <div className="font-mono text-[8px] tracking-widest text-hp-cg/55 mb-3 uppercase">Ball 8.2 · Player Performance</div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { l: 'SPEED', v: '104 km/h' },
                  { l: 'LENGTH', v: 'Good length' },
                  { l: 'RESULT', v: 'Dot ball' },
                ].map(({ l, v }) => (
                  <div key={l}>
                    <div className="font-mono text-[7px] tracking-widest text-hp-paper/72 mb-0.5">{l}</div>
                    <div className="font-mono text-[11px] text-hp-paper/75">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Separator */}
            <div className="flex items-center gap-3 px-2">
              <div className="flex-1 h-px bg-white/5" />
              <span className="font-mono text-[7px] tracking-widest text-hp-paper/85 uppercase">analysed</span>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            {/* Card 03 — Player performance */}
            <div className="border border-white/8 bg-hp-surface p-4">
              <div className="font-mono text-[8px] tracking-widest text-hp-paper/52 mb-3 uppercase">Player Performance · #1042</div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { l: 'WKTS', v: '12' },
                  { l: 'AVG', v: '22.4' },
                  { l: 'ECO', v: '6.2' },
                  { l: 'SR', v: '21.8' },
                ].map(({ l, v }) => (
                  <div key={l}>
                    <div className="font-mono font-bold text-[22px] text-hp-paper leading-none mb-1">{v}</div>
                    <div className="font-mono text-[7px] tracking-widest text-hp-paper/52">{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 04 — AI Performance Insight */}
            <div className="border border-hp-cg/20 bg-hp-cg/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-hp-cg" />
                <span className="font-mono text-[8px] tracking-widest text-hp-cg">AI PERFORMANCE INSIGHT</span>
              </div>
              <div className="font-mono text-[7px] text-hp-paper/52 mb-2 tracking-wider">Based on recent performance</div>
              <p className="text-[11px] text-hp-paper/82 leading-relaxed">
                Economy improving across recent matches. Powerplay consistency strong. Development focus: middle overs.
              </p>
            </div>

            {/* Card 05 — Development Focus */}
            <div className="border border-white/8 bg-hp-surface p-4">
              <div className="font-mono text-[8px] tracking-widest text-hp-paper/52 mb-2 uppercase">Development Focus</div>
              <div className="font-mono text-[13px] text-hp-paper/75 mb-1.5">Middle overs</div>
              <div className="font-mono text-[9px] text-hp-cg/70 tracking-wider">
                Training focus → Control + variation + consistency
              </div>
            </div>

            {/* Product label */}
            <div className="flex items-center gap-3 px-1 pt-1">
              <div className="flex-1 h-px bg-white/5" />
              <span className="font-mono text-[7px] tracking-[0.28em] text-hp-paper/72 uppercase">One ball. Connected through the cricket journey.</span>
              <div className="flex-1 h-px bg-white/5" />
            </div>
          </div>
        </div>
      </div>

      {/* Journey strip */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-white/5">
        <div className="max-w-[1440px] mx-auto px-8 py-5 flex items-center gap-4">
          {['BALL', 'DATA', 'INSIGHT', 'DEVELOPMENT', 'PROGRESS'].map((step, i) => (
            <Fragment key={step}>
              <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/72 uppercase">{step}</span>
              {i < 4 && <span className="text-hp-paper/78 text-[10px]">→</span>}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── WHAT IS CRIC HQ ─────────────────────────────────────────────────────────

function WhatIsCricHQ() {
  const stages = [
    {
      num: '01',
      label: 'CAPTURE',
      desc: 'Match and performance data captured ball-by-ball with precision.',
    },
    {
      num: '02',
      label: 'CONNECT',
      desc: 'Players, teams, coaches and competitions linked in one system.',
    },
    {
      num: '03',
      label: 'UNDERSTAND',
      desc: 'Statistics, trends and performance insight revealed across every level.',
    },
    {
      num: '04',
      label: 'DEVELOP',
      desc: 'Coaching, training and development pathways built on structured data.',
    },
    {
      num: '05',
      label: 'PROGRESS',
      desc: 'Track improvement over time — from the first ball to the next stage.',
    },
  ]

  return (
    <section id="what-is-cric-hq" className="relative bg-[#0A0C10] py-28 overflow-hidden">
      <Image
        src="/hp/what-is.jpg"
        alt=""
        aria-hidden="true"
        fill
        priority={false}
        sizes="100vw"
        className="object-cover object-center opacity-25"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0C10]/80 via-[#0A0C10]/50 to-[#0A0C10]/80" />
      <div className="relative max-w-[1440px] mx-auto px-8">
        <div className="mb-16 text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <span className="block w-6 h-px bg-hp-cg/50" />
            <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">The Connected Journey</span>
            <span className="block w-6 h-px bg-hp-cg/50" />
          </div>
          <h2
            className="font-display font-black uppercase text-hp-paper leading-[0.9] mb-6"
            style={{ fontSize: 'clamp(44px, 5.5vw, 80px)' }}
          >
            ONE BALL.<br />ONE CONNECTED JOURNEY.
          </h2>
          <p className="text-hp-paper/72 text-[16px] leading-relaxed max-w-xl mx-auto">
            From match capture to player development, CRIC HQ connects the data, people and decisions that move cricket forward.
          </p>
        </div>

        {/* Five-stage flow */}
        <div className="relative grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-white/5">
          {stages.map(({ num, label, desc }, i) => (
            <div key={num} className="relative bg-[#0A0C10] p-8 group hover:bg-hp-surface transition-colors cursor-default">
              {/* Connector arrow — desktop only */}
              {i < stages.length - 1 && (
                <span className="hidden lg:block absolute top-8 -right-3 z-10 font-mono text-[10px] text-hp-cg/30">→</span>
              )}
              <div className="font-mono text-[9px] tracking-[0.3em] text-hp-cg/40 mb-4">{num}</div>
              <div className="font-display font-black text-[22px] tracking-widest text-hp-paper uppercase mb-4 group-hover:text-hp-cg transition-colors">
                {label}
              </div>
              <p className="text-hp-paper/85 text-[13px] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── CHOOSE ROUTE ─────────────────────────────────────────────────────────────

function ChooseRoute() {
  const [active, setActive] = useState<number | null>(null)

  const routes = [
    {
      label: 'PLAYER / PARENT',
      eyebrow: 'For the player and family',
      points: [
        'Build your cricket identity',
        'Track every match and performance',
        'Follow your development journey',
        'Build a lifelong cricket record',
      ],
      cta: 'CLAIM YOUR CRICKET PASSPORT',
      accent: 'red',
      sub: null,
    },
    {
      label: 'COACH',
      eyebrow: 'For the development professional',
      points: [
        'Manage players and squads',
        'Turn match data into coaching insight',
        'Set goals and track development',
        'Connect observation → training → progress',
      ],
      cta: 'STREAMLINE YOUR SQUAD',
      accent: 'navy',
      sub: null,
    },
    {
      label: 'ORGANISATION',
      eyebrow: 'For administrators and leaders',
      points: [
        'Manage players, teams and competitions',
        'Score and capture match data',
        'Connect competition → statistics → development',
        'Build a connected cricket ecosystem',
      ],
      cta: 'DIGITISE YOUR ASSOCIATION',
      accent: 'gold',
      sub: 'CLUBS · SCHOOLS · ACADEMIES · ASSOCIATIONS · CRICKET BOARDS',
    },
  ]

  return (
    <section className="bg-hp-ink py-28">
      <div className="max-w-[1440px] mx-auto px-8">
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <span className="block w-6 h-px bg-hp-cg/50" />
            <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">Choose your route</span>
          </div>
          <h2
            className="font-display font-black uppercase text-hp-paper leading-[0.9]"
            style={{ fontSize: 'clamp(44px, 5vw, 72px)' }}
          >
            HOW WILL YOU<br />USE CRIC HQ?
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-white/5">
          {routes.map((route, i) => (
            <div
              key={i}
              className={`relative bg-hp-ink p-10 flex flex-col hover:bg-hp-surface cursor-pointer transition-all duration-300 ${
                active === i ? 'bg-hp-surface' : ''
              }`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              <div className="font-mono text-[9px] tracking-[0.28em] text-hp-paper/52 mb-5 uppercase">
                {route.eyebrow}
              </div>
              <h3
                className={`font-display font-black text-[28px] uppercase mb-8 transition-colors leading-tight ${
                  active === i
                    ? route.accent === 'gold'
                      ? 'text-hp-ca'
                      : route.accent === 'navy'
                      ? 'text-hp-cn'
                      : 'text-hp-cg'
                    : 'text-hp-paper'
                }`}
              >
                {route.label}
              </h3>
              <ul className="space-y-3 flex-1">
                {route.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-3 text-[13px] text-hp-paper/74">
                    <span
                      className={`mt-2 w-1 h-1 rounded-full flex-shrink-0 ${
                        route.accent === 'gold' ? 'bg-hp-ca/50' : route.accent === 'navy' ? 'bg-hp-cn/50' : 'bg-hp-cg/50'
                      }`}
                    />
                    {pt}
                  </li>
                ))}
              </ul>
              {route.sub && (
                <div className="mt-5 font-mono text-[7px] tracking-[0.18em] text-hp-paper/85 uppercase leading-relaxed">
                  {route.sub}
                </div>
              )}
              <div className="mt-8">
                <a
                  href="#"
                  className={`inline-flex items-center gap-2 font-display font-bold text-xs tracking-widest uppercase transition-colors ${
                    route.accent === 'gold'
                      ? 'text-hp-ca hover:text-hp-ca/70'
                      : route.accent === 'navy'
                      ? 'text-hp-cn hover:text-hp-cn/70'
                      : 'text-hp-cg hover:text-hp-cg/70'
                  }`}
                >
                  {route.cta} <span className="text-sm">→</span>
                </a>
              </div>
              <div
                className={`absolute bottom-0 left-0 right-0 h-px transition-all duration-300 ${
                  active === i
                    ? route.accent === 'gold'
                      ? 'bg-hp-ca/50'
                      : route.accent === 'navy'
                      ? 'bg-hp-cn/50'
                      : 'bg-hp-cg/50'
                    : 'bg-transparent'
                }`}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── AHA MOMENT ──────────────────────────────────────────────────────────────

function AhaMoment() {
  const [step, setStep] = useState(0)

  const steps = [
    {
      label: 'MATCH',
      title: 'The ball is bowled.',
      content: (
        <div className="grid grid-cols-2 gap-3">
          {[
            { l: 'Bowler', v: 'Kingshuk' },
            { l: 'Speed', v: '104 km/h' },
            { l: 'Length', v: 'Good length' },
            { l: 'Result', v: 'Dot ball' },
          ].map(({ l, v }) => (
            <div key={l} className="bg-hp-surface p-4 border border-white/6">
              <div className="font-mono text-[8px] tracking-widest text-hp-paper/52 mb-1.5 uppercase">{l}</div>
              <div className="font-mono text-sm text-hp-paper/78">{v}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      label: 'LIVE SCORE',
      title: 'Instantly in the scorecard.',
      content: (
        <div className="bg-hp-surface border border-white/6 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono text-[8px] tracking-widest text-red-400">LIVE</span>
            </div>
            <span className="font-mono text-[8px] text-hp-paper/52">8.2 OVERS</span>
          </div>
          <div className="font-display font-black text-5xl text-hp-paper mb-1">
            42<span className="text-hp-paper/72">/2</span>
          </div>
          <div className="flex gap-1.5 mt-4">
            {['1', 'W', '4', '·', '·', '6', '·', '·'].map((b, i) => (
              <span
                key={i}
                className={`w-7 h-7 flex items-center justify-center font-mono text-[11px] font-bold border ${
                  b === 'W'
                    ? 'border-red-500/40 text-red-400'
                    : b === '4' || b === '6'
                    ? 'border-hp-cg/40 text-hp-cg'
                    : 'border-white/8 text-hp-paper/78'
                }`}
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      ),
    },
    {
      label: 'PLAYER RECORD',
      title: 'Every ball updates the record.',
      content: (
        <div>
          <div className="font-mono text-[8px] tracking-widest text-hp-paper/52 mb-5 uppercase">
            Kingshuk — Season 2024/25
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { l: 'WICKETS', v: '12' },
              { l: 'ECONOMY', v: '6.2' },
              { l: 'AVERAGE', v: '22.4' },
              { l: 'STRIKE RT', v: '21.8' },
            ].map(({ l, v }) => (
              <div key={l} className="bg-hp-surface p-4 border border-white/6">
                <div className="font-mono font-bold text-[22px] text-hp-paper mb-1 leading-none">{v}</div>
                <div className="font-mono text-[7px] tracking-widest text-hp-paper/52">{l}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      label: 'PERFORMANCE',
      title: 'Patterns emerge.',
      content: (
        <div className="space-y-5">
          {[
            { l: 'Phase performance', bars: [62, 75, 85] },
            { l: 'Consistency', bars: [70, 78, 85] },
            { l: 'Match trends', bars: [52, 65, 80] },
          ].map(({ l, bars }) => (
            <div key={l}>
              <div className="flex justify-between mb-2">
                <span className="font-mono text-[9px] tracking-widest text-hp-paper/65 uppercase">{l}</span>
                <span className="font-mono text-[9px] text-hp-paper/75">{bars[2]}%</span>
              </div>
              <div className="flex gap-1">
                {bars.map((b, i) => (
                  <div key={i} className="flex-1 h-2 bg-[#141820] relative">
                    <div className="absolute inset-y-0 left-0 bg-hp-cg/55" style={{ width: `${b}%` }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      label: 'AI INSIGHT',
      title: 'Intelligence from data.',
      content: (
        <div className="space-y-3">
          {[
            {
              type: 'Performance Trend',
              insight: 'Economy improving over last 3 matches. Dot ball percentage up 12%.',
              indicator: '↑ Positive',
              accent: 'red',
            },
            {
              type: 'Development Opportunity',
              insight: 'Middle overs performance below season average. Clear improvement opportunity.',
              indicator: '→ Focus area',
              accent: 'navy',
            },
          ].map(({ type, insight, indicator, accent }) => (
            <div
              key={type}
              className={`border p-4 ${
                accent === 'red' ? 'border-hp-cg/20 bg-hp-cg/5' : accent === 'navy' ? 'border-hp-cn/20 bg-hp-cn/5' : 'border-hp-ca/20 bg-hp-ca/5'
              }`}
            >
              <div
                className={`font-mono text-[8px] tracking-widest mb-2 flex items-center justify-between ${
                  accent === 'red' ? 'text-hp-cg' : accent === 'navy' ? 'text-hp-cn' : 'text-hp-ca'
                }`}
              >
                <span>{type}</span>
                <span>{indicator}</span>
              </div>
              <p className="text-[12px] text-hp-paper/82 leading-relaxed">{insight}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      label: 'DEVELOPMENT',
      title: 'Insight becomes action.',
      content: (
        <div className="divide-y divide-white/5">
          {[
            { l: 'Coach feedback', v: 'Work on middle overs line and length consistency.' },
            { l: 'Training goal', v: 'Target 60% dot balls in overs 7–15 this season.' },
            { l: 'Next match', v: 'Sat 21 Sep — Grade 1 v Northside CC, Oval 2' },
          ].map(({ l, v }) => (
            <div key={l} className="flex gap-5 py-4">
              <div className="w-32 font-mono text-[8px] tracking-widest text-hp-paper/52 uppercase flex-shrink-0 pt-0.5">
                {l}
              </div>
              <div className="text-[13px] text-hp-paper/85 leading-relaxed">{v}</div>
            </div>
          ))}
        </div>
      ),
    },
  ]

  return (
    <section className="relative bg-[#0A0C10] py-28 overflow-hidden">
      <Image
        src="/hp/aha.jpg"
        alt=""
        aria-hidden="true"
        fill
        priority={false}
        sizes="100vw"
        className="object-cover object-center opacity-22"
      />
      <div className="absolute inset-0 bg-gradient-to-l from-[#0A0C10]/85 via-[#0A0C10]/55 to-[#0A0C10]/85" />
      <div className="relative max-w-[1440px] mx-auto px-8">
        <div className="mb-16 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className="block w-6 h-px bg-hp-cg/50" />
            <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">The aha moment</span>
            <span className="block w-6 h-px bg-hp-cg/50" />
          </div>
          <h2
            className="font-display font-black uppercase text-hp-paper leading-[0.9] mb-6"
            style={{ fontSize: 'clamp(36px, 4.5vw, 60px)' }}
          >
            FROM ONE BALL TO A<br />PLAYER&apos;S CRICKET JOURNEY.
          </h2>
          <p className="text-hp-paper/65 text-[15px] max-w-lg mx-auto mb-4">
            A single delivery triggers a chain of intelligence that builds a complete cricket profile.
          </p>
          <div className="inline-flex items-center gap-2 border border-hp-cg/25 px-4 py-2">
            <div className="w-1.5 h-1.5 rounded-full bg-hp-cg" />
            <span className="font-mono text-[8px] tracking-[0.25em] text-hp-cg uppercase">One delivery. Six connected data points.</span>
          </div>
        </div>

        {/* Step tabs */}
        <div className="flex flex-wrap justify-center border border-white/8 max-w-3xl mx-auto mb-12 overflow-hidden">
          {steps.map((s, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`flex-1 min-w-[80px] px-5 py-3 font-mono text-[8px] tracking-[0.22em] uppercase transition-all border-r border-white/8 last:border-0 ${
                step === i ? 'bg-hp-cg text-hp-paper' : 'text-hp-paper/78 hover:text-hp-paper hover:bg-white/4'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Step content */}
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <div className="font-mono text-[9px] tracking-[0.28em] text-hp-paper/72 mb-2 uppercase">
              Step {step + 1} of {steps.length}
            </div>
            <h3 className="font-display font-black text-2xl text-hp-paper uppercase">
              {steps[step].title}
            </h3>
          </div>
          <div>{steps[step].content}</div>
          <div className="mt-8 flex gap-3">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="px-5 py-2.5 border border-white/10 font-mono text-[9px] tracking-widest text-hp-paper/65 hover:text-hp-paper hover:border-white/25 disabled:opacity-20 transition-colors uppercase"
            >
              ← Prev
            </button>
            <button
              onClick={() => setStep(Math.min(steps.length - 1, step + 1))}
              disabled={step === steps.length - 1}
              className="px-5 py-2.5 border border-white/10 font-mono text-[9px] tracking-widest text-hp-paper/65 hover:text-hp-paper hover:border-white/25 disabled:opacity-20 transition-colors uppercase"
            >
              Next →
            </button>
          </div>
          <p className="mt-8 text-hp-paper/52 text-[13px] leading-relaxed border-t border-white/5 pt-6">
            The ball doesn&apos;t end with the score. It becomes part of the player&apos;s journey.
          </p>
        </div>
      </div>
    </section>
  )
}

// ─── LIVE SCORING ─────────────────────────────────────────────────────────────

function LiveScoring() {
  const [tab, setTab] = useState<'scorecard' | 'stats'>('scorecard')

  const batsmen = [
    { name: 'R. Thompson', runs: 28, balls: 31, fours: 3, sr: '90.3', batting: true },
    { name: 'J. Patel', runs: 14, balls: 18, fours: 1, sr: '77.8', batting: true },
    { name: 'M. Richards', runs: 0, balls: 0, fours: 0, sr: '—', batting: false, out: 'b Kingshuk' },
  ]
  const bowlers = [
    { name: 'Kingshuk', overs: '3.2', wkts: 2, runs: 21, econ: '6.4', current: true },
    { name: 'M. Clarke', overs: '3', wkts: 0, runs: 18, econ: '6.0', current: false },
    { name: 'D. Singh', overs: '2', wkts: 0, runs: 11, econ: '5.5', current: false },
  ]

  return (
    <section className="relative bg-hp-ink py-28 overflow-hidden">
      {/* Night stadium background */}
      <Image
        src="/hp/live-scoring.jpg"
        alt=""
        aria-hidden="true"
        fill
        priority={false}
        sizes="100vw"
        className="object-cover object-center opacity-65"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-hp-ink via-hp-ink/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-hp-ink/25 via-transparent to-hp-ink/50" />
      <div className="relative max-w-[1440px] mx-auto px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_520px] gap-20 items-center">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <span className="block w-6 h-px bg-hp-cg/50" />
              <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">Live scoring</span>
            </div>
            <h2
              className="font-display font-black uppercase text-hp-paper leading-[0.9] mb-8"
              style={{ fontSize: 'clamp(44px, 5vw, 72px)' }}
            >
              EVERY BALL<br />MATTERS.
            </h2>
            <p className="text-hp-paper/74 text-[16px] leading-relaxed max-w-md mb-3">
              Live scoring captures the moment. CRIC HQ turns those moments into a connected performance history.
            </p>
            <p className="font-mono text-[9px] tracking-[0.22em] text-hp-cg/65 uppercase mb-8">
              Score once. Build the record automatically.
            </p>

            <div className="flex flex-col gap-0 mb-10 max-w-xs">
              {[
                'LIVE SCORE',
                'MATCH DATA',
                'PLAYER STATISTICS',
                'SEASON HISTORY',
                'CAREER HISTORY',
                'INSIGHTS',
              ].map((item, i) => (
                <div key={item} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                  <div
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      i === 0 ? 'bg-hp-cg' : i < 3 ? 'bg-hp-cg/40' : 'bg-white/15'
                    }`}
                  />
                  <span
                    className={`font-mono text-[9px] tracking-widest uppercase ${
                      i === 0 ? 'text-hp-cg' : i < 3 ? 'text-hp-paper/78' : 'text-hp-paper/52'
                    }`}
                  >
                    {item}
                  </span>
                </div>
              ))}
            </div>

            <a
              href="#"
              className="inline-flex items-center gap-2 bg-hp-cg text-hp-paper font-display font-black text-sm px-8 py-3.5 tracking-widest uppercase hover:bg-hp-cg/90 transition-colors"
            >
              EXPLORE LIVE SCORING
            </a>
          </div>

          {/* Scorecard */}
          <div className="border border-white/8 bg-hp-surface">
            <div className="border-b border-white/5 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-mono text-[8px] tracking-widest text-red-400">LIVE</span>
              </div>
              <span className="font-mono text-[8px] text-hp-paper/72 text-right">NORTHSIDE v SOUTHSIDE · T20</span>
            </div>

            <div className="p-5 border-b border-white/5">
              <div className="flex items-baseline gap-4">
                <span className="font-display font-black text-5xl text-hp-paper">42</span>
                <span className="font-display font-black text-3xl text-hp-paper/72">/2</span>
                <div className="ml-auto text-right">
                  <div className="font-mono text-[9px] text-hp-paper/78">8.2 OVERS</div>
                  <div className="font-mono text-sm text-hp-paper/80 font-medium">CRR 5.12</div>
                </div>
              </div>
            </div>

            <div className="flex border-b border-white/5">
              {(['scorecard', 'stats'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-3 font-mono text-[8px] tracking-widest uppercase transition-colors border-b-2 ${
                    tab === t ? 'text-hp-cg border-hp-cg' : 'text-hp-paper/52 hover:text-hp-paper border-transparent'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="p-4">
              {tab === 'scorecard' ? (
                <div className="space-y-5">
                  <div>
                    <div className="font-mono text-[7px] tracking-widest text-hp-paper/72 mb-2 uppercase">Batting</div>
                    <table className="w-full">
                      <thead>
                        <tr className="text-hp-paper/72 font-mono text-[7px] tracking-widest">
                          <th className="text-left pb-2 font-normal">BATTER</th>
                          <th className="text-right pb-2 font-normal">R</th>
                          <th className="text-right pb-2 font-normal">B</th>
                          <th className="text-right pb-2 font-normal">4s</th>
                          <th className="text-right pb-2 font-normal">SR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batsmen.map((b) => (
                          <tr key={b.name} className="border-t border-white/4">
                            <td className="py-2">
                              <span className={`text-[11px] ${b.batting ? 'text-hp-paper/88' : 'text-hp-paper/82'}`}>
                                {b.name}
                                {b.batting && <span className="ml-1 text-hp-cg text-[8px]">*</span>}
                              </span>
                              {'out' in b && b.out && (
                                <div className="font-mono text-[7px] text-hp-paper/74">{b.out as string}</div>
                              )}
                            </td>
                            <td className="text-right py-2 text-hp-paper font-mono font-bold text-[11px]">{b.runs}</td>
                            <td className="text-right py-2 text-hp-paper/65 font-mono text-[11px]">{b.balls}</td>
                            <td className="text-right py-2 text-hp-paper/65 font-mono text-[11px]">{b.fours}</td>
                            <td className="text-right py-2 text-hp-paper/78 font-mono text-[11px]">{b.sr}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <div className="font-mono text-[7px] tracking-widest text-hp-paper/72 mb-2 uppercase">Bowling</div>
                    <table className="w-full">
                      <thead>
                        <tr className="text-hp-paper/72 font-mono text-[7px] tracking-widest">
                          <th className="text-left pb-2 font-normal">BOWLER</th>
                          <th className="text-right pb-2 font-normal">OV</th>
                          <th className="text-right pb-2 font-normal">W</th>
                          <th className="text-right pb-2 font-normal">R</th>
                          <th className="text-right pb-2 font-normal">ECO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bowlers.map((b) => (
                          <tr key={b.name} className="border-t border-white/4">
                            <td className="py-2">
                              <span className={`text-[11px] ${b.current ? 'text-hp-paper/75' : 'text-hp-paper/72'}`}>
                                {b.name}
                                {b.current && <span className="ml-1 text-hp-cg text-[8px]">▸</span>}
                              </span>
                            </td>
                            <td className="text-right py-2 text-hp-paper/65 font-mono text-[11px]">{b.overs}</td>
                            <td className="text-right py-2 text-hp-paper font-mono font-bold text-[11px]">{b.wkts}</td>
                            <td className="text-right py-2 text-hp-paper/65 font-mono text-[11px]">{b.runs}</td>
                            <td className="text-right py-2 text-hp-paper/78 font-mono text-[11px]">{b.econ}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { l: 'Dot ball %', v: 42, accent: 'cg' },
                    { l: 'Boundary %', v: 28, accent: 'ca' },
                    { l: 'Singles %', v: 30, accent: '' },
                  ].map(({ l, v, accent }) => (
                    <div key={l}>
                      <div className="flex justify-between font-mono text-[9px] tracking-widest mb-2">
                        <span className="text-hp-paper/65 uppercase">{l}</span>
                        <span className="text-hp-paper/82">{v}%</span>
                      </div>
                      <div className="h-1.5 bg-[#141820]">
                        <div
                          className={`h-full ${
                            accent === 'cg' ? 'bg-hp-cg/60' : accent === 'ca' ? 'bg-hp-ca/60' : 'bg-white/25'
                          }`}
                          style={{ width: `${v}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── PLAYER PASSPORT ─────────────────────────────────────────────────────────

function PlayerPassport() {
  const [tab, setTab] = useState(0)
  const tabs = ['BATTING', 'BOWLING', 'FIELDING', 'CAREER']

  const timeline = [
    { label: 'Junior cricket', year: '2015–18', done: true },
    { label: 'School cricket', year: '2018–20', done: true },
    { label: 'Club cricket', year: '2020–22', done: true },
    { label: 'Representative', year: '2022–24', done: true },
    { label: 'Academy', year: '2024–', done: false, current: true },
    { label: 'High performance', year: 'Future', done: false, future: true },
  ]

  return (
    <section className="bg-[#0A0C10] py-28">
      <div className="max-w-[1440px] mx-auto px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <span className="block w-6 h-px bg-hp-cg/50" />
              <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">Player Cricket Passport</span>
            </div>
            <h2
              className="font-display font-black uppercase text-hp-paper leading-[0.9] mb-8"
              style={{ fontSize: 'clamp(38px, 4vw, 58px)' }}
            >
              ONE PLAYER.<br />ONE CRICKET<br />IDENTITY.
            </h2>
            <p className="text-hp-paper/74 text-[15px] leading-relaxed mb-4">
              Your cricket history shouldn&apos;t disappear when you change teams, clubs, schools or competitions. CRIC HQ creates a connected player record that grows with you.
            </p>
            <p className="font-mono text-[9px] tracking-[0.22em] text-hp-paper/78 uppercase mb-6">
              One player · One record · One journey
            </p>
            <div className="flex flex-wrap gap-2 mb-10">
              <span className="font-mono text-[7px] tracking-wider text-hp-paper/78 border border-white/8 px-3 py-1.5 uppercase">Secure youth profiles</span>
              <span className="font-mono text-[7px] tracking-wider text-hp-paper/78 border border-white/8 px-3 py-1.5 uppercase">Privacy-compliant data</span>
              <span className="font-mono text-[7px] tracking-wider text-hp-paper/78 border border-white/8 px-3 py-1.5 uppercase">Organisation-controlled access</span>
            </div>

            {/* Timeline */}
            <div className="relative pl-8">
              <div className="absolute left-2.5 top-2 bottom-2 w-px bg-white/8" />
              <div className="space-y-5">
                {timeline.map(({ label, year, done, current, future }) => (
                  <div key={label} className="relative flex items-center gap-4">
                    <div
                      className={`absolute -left-8 w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                        current
                          ? 'border-hp-cg bg-hp-cg/25'
                          : future
                          ? 'border-white/15 bg-transparent'
                          : done
                          ? 'border-hp-paper/35 bg-hp-surface'
                          : 'border-white/10'
                      }`}
                    />
                    <div>
                      <span
                        className={`text-[13px] ${
                          future ? 'text-hp-paper/85' : current ? 'text-hp-paper/80' : 'text-hp-paper/78'
                        }`}
                      >
                        {label}
                      </span>
                      <span className="ml-3 font-mono text-[8px] tracking-widest text-hp-paper/72">{year}</span>
                      {current && (
                        <span className="ml-2 font-mono text-[7px] text-hp-cg tracking-widest uppercase">CURRENT</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-12">
              <a
                href="#"
                className="inline-flex items-center gap-2 bg-hp-cg text-hp-paper font-display font-black text-sm px-8 py-3.5 tracking-widest uppercase hover:bg-hp-cg/90 transition-colors"
              >
                BUILD YOUR CRICKET PROFILE
              </a>
            </div>
          </div>

          <div>
            {/* Profile header */}
            <div className="bg-hp-surface border border-white/8 p-6 mb-px">
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 rounded-full bg-hp-cg/12 border border-hp-cg/25 flex items-center justify-center font-display font-black text-xl text-hp-cg flex-shrink-0">
                  KP
                </div>
                <div className="flex-1">
                  <div className="font-display font-black text-xl text-hp-paper uppercase tracking-wide">
                    Kingshuk Patel
                  </div>
                  <div className="font-mono text-[8px] tracking-widest text-hp-paper/78 mt-0.5">
                    RIGHT ARM MED-FAST · BAT ORDER 8
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {['Northside CC', 'St Andrews School', 'State Academy'].map((tag) => (
                      <span
                        key={tag}
                        className="font-mono text-[7px] tracking-wider text-hp-paper/82 border border-white/8 px-2 py-1"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-hp-surface border border-white/8 border-t-0">
              <div className="flex border-b border-white/5">
                {tabs.map((t, i) => (
                  <button
                    key={t}
                    onClick={() => setTab(i)}
                    className={`flex-1 py-3 font-mono text-[8px] tracking-widest uppercase transition-colors border-b-2 ${
                      tab === i ? 'text-hp-cg border-hp-cg' : 'text-hp-paper/52 hover:text-hp-paper border-transparent'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="p-5">
                {tab === 0 && (
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { l: 'MATCHES', v: '42' },
                      { l: 'INNINGS', v: '28' },
                      { l: 'RUNS', v: '486' },
                      { l: 'AVERAGE', v: '22.1' },
                      { l: 'STRIKE RT', v: '88.4' },
                      { l: 'HIGHEST', v: '67' },
                    ].map(({ l, v }) => (
                      <div key={l}>
                        <div className="font-mono font-bold text-2xl text-hp-paper mb-1 leading-none">{v}</div>
                        <div className="font-mono text-[7px] tracking-widest text-hp-paper/52">{l}</div>
                      </div>
                    ))}
                  </div>
                )}
                {tab === 1 && (
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { l: 'WICKETS', v: '12' },
                      { l: 'OVERS', v: '48.2' },
                      { l: 'RUNS', v: '302' },
                      { l: 'ECONOMY', v: '6.2' },
                      { l: 'AVERAGE', v: '22.4' },
                      { l: 'BEST', v: '3/28' },
                    ].map(({ l, v }) => (
                      <div key={l}>
                        <div className="font-mono font-bold text-2xl text-hp-paper mb-1 leading-none">{v}</div>
                        <div className="font-mono text-[7px] tracking-widest text-hp-paper/52">{l}</div>
                      </div>
                    ))}
                  </div>
                )}
                {tab === 2 && (
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { l: 'CATCHES', v: '8' },
                      { l: 'RUN-OUTS', v: '2' },
                      { l: 'DISMISSALS', v: '10' },
                    ].map(({ l, v }) => (
                      <div key={l}>
                        <div className="font-mono font-bold text-2xl text-hp-paper mb-1 leading-none">{v}</div>
                        <div className="font-mono text-[7px] tracking-widest text-hp-paper/52">{l}</div>
                      </div>
                    ))}
                  </div>
                )}
                {tab === 3 && (
                  <div className="divide-y divide-white/5">
                    {[
                      { season: '2024/25', team: 'State Academy', matches: 12, wkts: 12 },
                      { season: '2023/24', team: 'Northside CC — Grade 1', matches: 18, wkts: 24 },
                      { season: '2022/23', team: 'Northside CC — Grade 2', matches: 12, wkts: 18 },
                    ].map((s) => (
                      <div key={s.season} className="flex items-center justify-between py-3">
                        <div>
                          <div className="text-[13px] text-hp-paper/65">{s.team}</div>
                          <div className="font-mono text-[8px] tracking-widest text-hp-paper/52 mt-0.5">{s.season}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-hp-paper text-sm">{s.wkts} wkts</div>
                          <div className="font-mono text-[8px] text-hp-paper/52 mt-0.5">{s.matches} matches</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── WHY CRIC HQ ─────────────────────────────────────────────────────────────

function WhyCricHQ() {
  const points = [
    {
      label: 'ONE RECORD',
      desc: 'Your cricket history stays connected as you move between teams, clubs, schools and competitions.',
    },
    {
      label: 'ONE DATA LAYER',
      desc: 'Match data becomes reusable across statistics, performance, coaching and reporting. Existing scorebooks and records can be migrated where supported.',
    },
    {
      label: 'ONE JOURNEY',
      desc: 'Your cricket story continues from junior cricket through every stage of development.',
    },
  ]

  return (
    <section className="bg-hp-ink py-28 border-t border-white/5">
      <div className="max-w-[1440px] mx-auto px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-20 items-center">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <span className="block w-6 h-px bg-hp-cg/50" />
              <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">Why CRIC HQ</span>
            </div>
            <h2
              className="font-display font-black uppercase text-hp-paper leading-[0.9] mb-8"
              style={{ fontSize: 'clamp(36px, 4.5vw, 58px)' }}
            >
              YOUR CRICKET DATA<br />SHOULDN&apos;T START AGAIN<br />EVERY SEASON.
            </h2>
            <p className="text-hp-paper/72 text-[15px] leading-relaxed mb-10">
              Connect matches, players, teams, clubs, schools and competitions into one persistent cricket record.
            </p>

            {/* Flow */}
            <div className="flex flex-wrap items-center gap-0 mb-10">
              {['MATCHES', 'PLAYER RECORD', 'SEASON HISTORY', 'CAREER HISTORY'].map((step, i, arr) => (
                <Fragment key={step}>
                  <span className="font-mono text-[8px] tracking-wider text-hp-paper/82 border border-white/8 px-3 py-2 uppercase">{step}</span>
                  {i < arr.length - 1 && <span className="text-hp-paper/82 text-[9px] px-2">→</span>}
                </Fragment>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-px bg-white/5">
            {points.map(({ label, desc }) => (
              <div key={label} className="bg-hp-ink p-7 hover:bg-hp-surface transition-colors group cursor-default">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-hp-cg/50 flex-shrink-0" />
                  <div className="font-display font-black text-[15px] text-hp-paper uppercase group-hover:text-hp-cg transition-colors">
                    {label}
                  </div>
                </div>
                <p className="text-[13px] text-hp-paper/65 leading-relaxed pl-4">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── PERFORMANCE ─────────────────────────────────────────────────────────────

function Performance() {
  const [cat, setCat] = useState<'BATTING' | 'BOWLING' | 'FIELDING'>('BOWLING')

  const data: Record<string, { l: string; v: string; bar: number }[]> = {
    BATTING: [
      { l: 'Runs', v: '486', bar: 70 },
      { l: 'Average', v: '22.1', bar: 55 },
      { l: 'Strike Rate', v: '88.4', bar: 65 },
      { l: 'Boundary %', v: '28%', bar: 28 },
    ],
    BOWLING: [
      { l: 'Wickets', v: '12', bar: 60 },
      { l: 'Economy', v: '6.2', bar: 72 },
      { l: 'Average', v: '22.4', bar: 68 },
      { l: 'Dot-ball %', v: '42%', bar: 42 },
    ],
    FIELDING: [
      { l: 'Catches', v: '8', bar: 80 },
      { l: 'Run-outs', v: '2', bar: 40 },
      { l: 'Dismissals', v: '10', bar: 66 },
    ],
  }

  const form = [
    { match: 'v Southside', wkts: 2, eco: '5.8', result: 'W' },
    { match: 'v Riverside', wkts: 1, eco: '7.2', result: 'L' },
    { match: 'v Bayside', wkts: 3, eco: '5.1', result: 'W' },
    { match: 'v Central', wkts: 2, eco: '6.4', result: 'W' },
    { match: 'v Hills CC', wkts: 4, eco: '4.8', result: 'W' },
  ]

  return (
    <section className="relative bg-hp-ink py-28 overflow-hidden">
      <Image
        src="/hp/performance.jpg"
        alt=""
        aria-hidden="true"
        fill
        priority={false}
        sizes="100vw"
        className="object-cover object-center opacity-20"
        style={{ objectPosition: '70% center' }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-hp-ink via-hp-ink/75 to-hp-ink/30" />
      <div className="relative max-w-[1440px] mx-auto px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-20 items-start">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <span className="block w-6 h-px bg-hp-cg/50" />
              <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">Performance</span>
            </div>
            <h2
              className="font-display font-black uppercase text-hp-paper leading-[0.9] mb-6"
              style={{ fontSize: 'clamp(36px, 4vw, 56px)' }}
            >
              YOUR SCORECARD<br />TELLS YOU WHAT<br />HAPPENED.
            </h2>
            <p className="font-display font-bold text-lg text-hp-cg uppercase tracking-wider mb-6 leading-snug">
              CRIC HQ HELPS YOU<br />UNDERSTAND THE PATTERN.
            </p>
            <p className="text-hp-paper/88 text-[14px] leading-relaxed mb-6">
              Move beyond scores to understand performance patterns, form trends and development opportunities across every match and season.
            </p>
            <p className="text-hp-paper/78 text-[13px] leading-relaxed italic mb-6">
              From numbers to context. From results to trends. From trends to development opportunities.
            </p>
            <div className="flex flex-wrap items-center gap-0">
              {['WHAT HAPPENED', 'WHY IT MATTERS', 'WHAT TO WORK ON NEXT'].map((step, i, arr) => (
                <Fragment key={step}>
                  <span className={`font-mono text-[8px] tracking-wider px-3 py-2 border uppercase ${i === 0 ? 'border-white/12 text-hp-paper/65' : i === 1 ? 'border-hp-ca/20 text-hp-ca/55' : 'border-hp-cg/25 text-hp-cg/70'}`}>{step}</span>
                  {i < arr.length - 1 && <span className="text-hp-paper/82 text-[9px] px-1">→</span>}
                </Fragment>
              ))}
            </div>
          </div>

          <div>
            {/* Category selector */}
            <div className="flex mb-8 border border-white/8">
              {(['BATTING', 'BOWLING', 'FIELDING'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`flex-1 py-3 font-mono text-[9px] tracking-widest uppercase transition-colors ${
                    cat === c ? 'bg-hp-cg text-hp-paper' : 'text-hp-paper/78 hover:text-hp-paper hover:bg-white/4'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="space-y-6 mb-10">
              {data[cat].map(({ l, v, bar }) => (
                <div key={l}>
                  <div className="flex justify-between mb-2">
                    <span className="font-mono text-[10px] tracking-widest text-hp-paper/88 uppercase">{l}</span>
                    <span className="font-mono font-bold text-sm text-hp-paper">{v}</span>
                  </div>
                  <div className="h-2 bg-hp-surface">
                    <div
                      className="h-full bg-hp-cg/55 transition-all duration-500"
                      style={{ width: `${bar}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Form table */}
            <div className="border border-white/6 bg-hp-surface">
              <div className="px-4 py-3 border-b border-white/5">
                <span className="font-mono text-[8px] tracking-widest text-hp-paper/52 uppercase">Recent form — last 5 matches</span>
              </div>
              <table className="w-full">
                <tbody>
                  {form.map((f) => (
                    <tr key={f.match} className="border-t border-white/4 first:border-0">
                      <td className="px-4 py-3 text-[11px] text-hp-paper/78">{f.match}</td>
                      <td className="px-4 py-3 font-mono text-[10px] text-hp-paper/78">{f.wkts} wkts</td>
                      <td className="px-4 py-3 font-mono text-[10px] text-hp-paper/85">Eco {f.eco}</td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-mono text-[8px] tracking-widest px-2 py-1 ${
                            f.result === 'W'
                              ? 'bg-hp-cg/12 text-hp-cg border border-hp-cg/22'
                              : 'bg-red-500/10 text-red-400 border border-red-500/18'
                          }`}
                        >
                          {f.result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── AI ──────────────────────────────────────────────────────────────────────

function AISection() {
  const groups = [
    {
      outcome: 'UNDERSTAND',
      cards: [
        { label: 'AI PLAYER ANALYSIS', desc: 'Surfaces patterns in individual player data across matches, seasons and phases — making performance trends visible.' },
        { label: 'AI MATCH ANALYSIS', desc: 'Analyses ball-by-ball data to surface key moments, phase breakdowns and match-level patterns.' },
      ],
    },
    {
      outcome: 'COACH',
      cards: [
        { label: 'AI COACHING ASSISTANT', desc: 'Supports coaches with data-backed observations — highlighting patterns that could inform development conversations.' },
        { label: 'AI DEVELOPMENT INSIGHTS', desc: 'Identifies development opportunities by comparing current performance against historical trends and team context.' },
      ],
    },
    {
      outcome: 'COMMUNICATE',
      cards: [
        { label: 'AI PERFORMANCE REPORTS', desc: 'Generates structured performance summaries for players, coaches and organisations from match and season data.' },
      ],
    },
  ]

  return (
    <section className="bg-[#0A0C10] py-28">
      <div className="max-w-[1440px] mx-auto px-8">
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <span className="block w-6 h-px bg-hp-cg/50" />
            <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">Intelligence layer</span>
          </div>
          <h2
            className="font-display font-black uppercase text-hp-paper leading-[0.9] mb-6"
            style={{ fontSize: 'clamp(38px, 5vw, 64px)' }}
          >
            WHEN THE DATA GROWS,<br />THE INTELLIGENCE GROWS.
          </h2>
          <p className="text-hp-paper/88 text-[15px] max-w-xl leading-relaxed">
            AI works on top of structured cricket data to surface patterns, summarise performance and support better conversations between players, coaches and organisations.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-white/5 mb-8">
          {groups.map(({ outcome, cards }) => (
            <div key={outcome} className="bg-[#0A0C10] p-7">
              <div className="font-mono text-[8px] tracking-[0.25em] text-hp-cg/55 mb-5 uppercase border-b border-white/5 pb-4">{outcome}</div>
              <div className="space-y-5">
                {cards.map(({ label, desc }) => (
                  <div key={label} className="hover:bg-hp-surface/50 transition-colors group cursor-default p-2 -mx-2">
                    <div className="font-display font-black text-[14px] text-hp-paper uppercase mb-2 group-hover:text-hp-cg transition-colors leading-tight">
                      {label}
                    </div>
                    <p className="text-[12px] text-hp-paper/65 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border border-white/5 px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-hp-ca flex-shrink-0" />
            <span className="font-mono text-[9px] tracking-[0.22em] text-hp-paper/82 uppercase">AI supports the decision. The coach still leads it.</span>
          </div>
          <span className="font-mono text-[8px] tracking-[0.18em] text-hp-paper/20 uppercase">Built on structured cricket data. Designed to augment human judgement.</span>
        </div>
      </div>
    </section>
  )
}

// ─── COACHES ─────────────────────────────────────────────────────────────────

function CoachesSection() {
  const loop = [
    'PLAYER',
    'MATCH PERFORMANCE',
    'COACH OBSERVATION',
    'DEVELOPMENT GOAL',
    'TRAINING',
    'NEXT MATCH',
    'PROGRESS',
  ]

  return (
    <section className="bg-hp-ink py-28">
      <div className="max-w-[1440px] mx-auto px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <span className="block w-6 h-px bg-hp-ca/50" />
              <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">For coaches</span>
            </div>
            <h2
              className="font-display font-black uppercase text-hp-paper leading-[0.9] mb-8"
              style={{ fontSize: 'clamp(38px, 4.5vw, 60px)' }}
            >
              LESS ADMINISTRATION.<br />MORE COACHING.
            </h2>
            <p className="text-hp-paper/74 text-[15px] leading-relaxed mb-4">
              CRIC HQ automates the data work so coaches can focus on building better cricketers — through structured observation, meaningful feedback and clear development pathways.
            </p>
            <p className="text-hp-paper/78 text-[14px] leading-relaxed mb-10 border-l border-hp-ca/25 pl-4">
              Turn match evidence into structured development — without adding another layer of administration.
            </p>
            <a
              href="#"
              className="inline-flex items-center gap-2 bg-hp-ca text-hp-ink font-bold font-display font-black text-sm px-8 py-3.5 tracking-widest uppercase hover:bg-hp-ca/90 transition-colors"
            >
              EXPLORE COACHING
            </a>
          </div>

          {/* Feedback loop */}
          <div className="flex flex-col gap-0">
            {loop.map((step, i) => (
              <div key={step} className="relative">
                <div
                  className={`flex items-center gap-5 py-4 px-5 border-l-2 hover:bg-white/2 transition-colors ${
                    i === 0
                      ? 'border-hp-cg'
                      : i === loop.length - 1
                      ? 'border-hp-ca'
                      : 'border-white/8'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 font-mono text-[8px] font-bold ${
                      i === 0
                        ? 'border-hp-cg text-hp-cg'
                        : i === loop.length - 1
                        ? 'border-hp-ca text-hp-ca'
                        : 'border-white/18 text-hp-paper/52'
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span
                    className={`font-mono text-[10px] tracking-[0.22em] uppercase ${
                      i === 0
                        ? 'text-hp-cg'
                        : i === loop.length - 1
                        ? 'text-hp-ca'
                        : 'text-hp-paper/72'
                    }`}
                  >
                    {step}
                  </span>
                  {i < loop.length - 1 && (
                    <span className="ml-auto font-mono text-[9px] text-hp-paper/82">↓</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── ORGANISATIONS ───────────────────────────────────────────────────────────

function OrganisationsSection() {
  const orgs = [
    { label: 'CLUBS', desc: 'Manage players, teams, fixtures, scoring and competition data for your club.' },
    { label: 'SCHOOLS', desc: 'Connect school cricket to a structured development pathway for every student player.' },
    { label: 'ACADEMIES', desc: 'Performance tracking, coaching tools and development pathways for your programme.' },
    { label: 'ASSOCIATIONS', desc: 'Manage competitions, rankings, statistics and club data across your association.' },
    { label: 'CRICKET BOARDS', desc: 'Oversight and data across all levels of the game within your jurisdiction.' },
  ]

  const caps = [
    'Players', 'Teams', 'Coaches', 'Fixtures',
    'Live scoring', 'Competitions', 'Statistics', 'Reports', 'Communication',
  ]

  return (
    <section className="bg-[#0A0C10] py-28">
      <div className="max-w-[1440px] mx-auto px-8">
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <span className="block w-6 h-px bg-hp-cg/50" />
            <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">For organisations</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-end">
            <h2
              className="font-display font-black uppercase text-hp-paper leading-[0.9]"
              style={{ fontSize: 'clamp(36px, 4.5vw, 60px)' }}
            >
              ONE CONNECTED PLATFORM FOR YOUR CRICKET ORGANISATION.
            </h2>
            <div>
              <p className="text-hp-paper/88 text-[15px] leading-relaxed mb-4">
                Connect your players, teams, competitions, matches, statistics and development data in one ecosystem.
              </p>
              <div className="flex flex-wrap items-center gap-0 mb-6">
                {['MANAGE', 'CAPTURE', 'CONNECT', 'ANALYSE', 'DEVELOP', 'REPORT'].map((step, i, arr) => (
                  <Fragment key={step}>
                    <span className="font-mono text-[8px] tracking-wider text-hp-paper/82 border border-white/8 px-3 py-1.5 uppercase">{step}</span>
                    {i < arr.length - 1 && <span className="text-hp-paper/78 text-[9px] px-1">→</span>}
                  </Fragment>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {caps.map((c) => (
                  <span
                    key={c}
                    className="font-mono text-[8px] tracking-wider text-hp-paper/78 border border-white/8 px-3 py-1.5 uppercase"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-px bg-white/5 mb-10">
          {orgs.map(({ label, desc }) => (
            <div
              key={label}
              className="bg-[#0A0C10] p-7 hover:bg-hp-surface transition-colors group cursor-default"
            >
              <div className="font-display font-black text-lg text-hp-paper uppercase mb-3 group-hover:text-hp-cg transition-colors">
                {label}
              </div>
              <p className="text-[12px] text-hp-paper/65 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <a
            href="#"
            className="inline-flex items-center gap-2 bg-hp-cg text-hp-paper font-display font-black text-sm px-10 py-4 tracking-widest uppercase hover:bg-hp-cg/90 transition-colors"
          >
            PARTNER WITH CRIC HQ
          </a>
        </div>
      </div>
    </section>
  )
}

// ─── COMPETITIONS ─────────────────────────────────────────────────────────────

function CompetitionsSection() {
  const lifecycle = ['FIXTURE', 'MATCH', 'SCORE', 'RESULT', 'STATISTICS', 'PLAYER RECORD', 'HISTORY']

  return (
    <section className="bg-hp-ink py-28">
      <div className="max-w-[1440px] mx-auto px-8">
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <span className="block w-6 h-px bg-hp-cg/50" />
            <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">Competitions</span>
          </div>
          <h2
            className="font-display font-black uppercase text-hp-paper leading-[0.9] mb-4"
            style={{ fontSize: 'clamp(44px, 5vw, 68px)' }}
          >
            FROM FIRST FIXTURE<br />TO FINAL.
          </h2>
          <p className="text-hp-paper/82 text-[14px] leading-relaxed max-w-lg">
            Every competition creates structured cricket data that continues to live beyond the final.
          </p>
        </div>

        {/* Lifecycle bar */}
        <div className="flex flex-wrap border border-white/8 mb-16 overflow-hidden">
          {lifecycle.map((step, i) => (
            <Fragment key={step}>
              <div className="flex-1 min-w-[100px] p-5 text-center hover:bg-hp-surface transition-colors group cursor-default">
                <div className="font-mono text-[7px] tracking-widest text-hp-paper/85 mb-1">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="font-display font-bold text-sm text-hp-paper/78 uppercase group-hover:text-hp-cg transition-colors tracking-wider">
                  {step}
                </div>
              </div>
              {i < lifecycle.length - 1 && (
                <div className="flex items-center px-0.5 text-hp-paper/78 text-xs">→</div>
              )}
            </Fragment>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/5">
          {[
            { l: 'Fixtures', d: 'Scheduling and management' },
            { l: 'Live Scores', d: 'Real-time match data' },
            { l: 'Ladders', d: 'Competition standings' },
            { l: 'Rankings', d: 'Player and team rankings' },
            { l: 'Results', d: 'Full match history' },
            { l: 'Statistics', d: 'Competition analytics' },
            { l: 'Player Awards', d: 'Recognise performance' },
            { l: 'Tournament History', d: 'Archive and records' },
          ].map(({ l, d }) => (
            <div key={l} className="bg-hp-ink p-5 hover:bg-hp-surface transition-colors">
              <div className="font-display font-bold text-sm text-hp-paper uppercase mb-1">{l}</div>
              <div className="font-mono text-[9px] tracking-wider text-hp-paper/52">{d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── DATA FLYWHEEL ───────────────────────────────────────────────────────────

function DataFlywheel() {
  const nodes = [
    'MORE MATCHES',
    'MORE DATA',
    'RICHER PLAYER RECORDS',
    'BETTER INSIGHTS',
    'BETTER DEVELOPMENT',
    'MORE VALUE',
    'MORE MATCHES',
  ]

  return (
    <section className="relative bg-[#0A0C10] py-28 overflow-hidden">
      {/* Cricket stadium aerial shot — gives the flywheel spatial context */}
      <Image
        src="/hp/flywheel.jpg"
        alt=""
        aria-hidden="true"
        fill
        priority={false}
        sizes="100vw"
        className="object-cover object-center opacity-30"
      />
      {/* Vignette — heavier at edges, opens up center */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_50%,transparent_30%,#0A0C10_80%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0C10]/70 via-transparent to-[#0A0C10]/70" />
      {/* Subtle red glow at center to reinforce flywheel hub */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_35%_at_50%_55%,rgba(232,54,42,0.08)_0%,transparent_70%)]" />
      <div className="relative max-w-[1440px] mx-auto px-8">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className="block w-6 h-px bg-hp-cg/50" />
            <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">Data Flywheel</span>
            <span className="block w-6 h-px bg-hp-cg/50" />
          </div>
          <h2
            className="font-display font-black uppercase text-hp-paper leading-[0.9] mb-6"
            style={{ fontSize: 'clamp(34px, 4vw, 54px)', paddingTop: '0px', paddingBottom: '0px' }}
          >
            THE MORE CRICKET YOU PLAY, THE RICHER YOUR CRIC HQ JOURNEY BECOMES.
          </h2>
        </div>

        <div className="relative h-[460px] max-w-2xl mx-auto flex items-center justify-center">
          {/* Orbital ring */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-80 h-80 rounded-full border border-white/5" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-52 h-52 rounded-full border border-white/4" />
          </div>

          {/* Center */}
          <div className="relative z-10 w-28 h-28 rounded-full border border-hp-cg/25 bg-hp-cg/8 flex items-center justify-center">
            <div className="text-center">
              <div className="font-display font-black text-hp-cg text-lg leading-none">CRIC</div>
              <div className="font-display font-black text-hp-cg text-lg leading-none">HQ</div>
            </div>
          </div>

          {/* Nodes */}
          {nodes.map((node, i) => {
            const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2
            const r = 160
            const x = Math.cos(angle) * r
            const y = Math.sin(angle) * r
            return (
              <div
                key={`${node}-${i}`}
                className="absolute z-20"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                  width: '136px',
                }}
              >
                <div className="bg-[#0A0C10] border border-white/10 px-3 py-2.5 text-center hover:border-hp-cg/30 hover:bg-hp-cg/5 transition-colors cursor-default">
                  <div className="font-mono text-[7px] tracking-widest text-hp-paper uppercase leading-tight">
                    {node}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── PROOF ───────────────────────────────────────────────────────────────────

function ProofSection() {
  const ecosystem = [
    { label: 'PLAYERS', desc: 'Every player builds a connected cricket record.' },
    { label: 'MATCHES', desc: 'Every match creates structured cricket data.' },
    { label: 'TEAMS', desc: 'Every team contributes to the wider ecosystem.' },
    { label: 'CLUBS', desc: 'Every club connects players, teams and competitions.' },
    { label: 'COMPETITIONS', desc: 'Every competition creates lasting cricket history.' },
  ]

  return (
    <section className="bg-hp-ink py-28 border-y border-white/5">
      <div className="max-w-[1440px] mx-auto px-8">
        <div className="mb-14 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className="block w-6 h-px bg-hp-cg/50" />
            <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">Built for cricket</span>
            <span className="block w-6 h-px bg-hp-cg/50" />
          </div>
          <h2
            className="font-display font-black uppercase text-hp-paper leading-[0.9]"
            style={{ fontSize: 'clamp(36px, 4.5vw, 58px)' }}
          >
            BUILT FOR CRICKET.<br />GROWING WITH THE GAME.
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-white/5">
          {ecosystem.map(({ label, desc }) => (
            <div key={label} className="bg-hp-ink px-8 py-10 text-center hover:bg-hp-surface transition-colors">
              <div className="font-display font-bold text-sm text-hp-paper uppercase tracking-wide mb-3">{label}</div>
              <div className="font-mono text-[9px] tracking-wider text-hp-paper/52 leading-relaxed">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── INSIGHTS ────────────────────────────────────────────────────────────────

function InsightsSection() {
  const articles = [
    {
      cat: 'CRICKET TECHNOLOGY',
      title: 'How ball-by-ball data is changing player development in community cricket.',
      date: 'Sep 2026',
    },
    {
      cat: 'PLAYER DEVELOPMENT',
      title: "Beyond the scoreboard: what performance data tells us about a young cricketer's potential.",
      date: 'Aug 2026',
    },
    {
      cat: 'AI IN CRICKET',
      title: 'The case for AI-assisted coaching observations — and where human judgement still leads.',
      date: 'Aug 2026',
    },
    {
      cat: 'CLUB MANAGEMENT',
      title: 'From spreadsheets to connected platforms: how cricket clubs are managing data in 2026.',
      date: 'Jul 2026',
    },
  ]

  return (
    <section className="bg-[#0A0C10] py-28">
      <div className="max-w-[1440px] mx-auto px-8">
        <div className="flex items-end justify-between mb-14">
          <div>
            <div className="flex items-center gap-3 mb-5">
              <span className="block w-6 h-px bg-hp-cg/50" />
              <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">Insights</span>
            </div>
            <h2
              className="font-display font-black uppercase text-hp-paper leading-[0.9] mb-2"
              style={{ fontSize: 'clamp(36px, 4vw, 54px)' }}
            >
              CRIC HQ INSIGHTS
            </h2>
            <p className="font-mono text-[9px] tracking-[0.22em] text-hp-cg/50 uppercase">Ideas shaping the future of cricket</p>
          </div>
          <a
            href="#"
            className="hidden lg:block font-mono text-[9px] tracking-widest text-hp-paper/78 hover:text-hp-paper uppercase transition-colors"
          >
            All insights →
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/5">
          {articles.map(({ cat, title, date }) => (
            <a
              key={title}
              href="#"
              className="bg-[#0A0C10] p-7 hover:bg-hp-surface transition-colors group block"
            >
              <div className="font-mono text-[8px] tracking-widest text-hp-cg/55 mb-5 uppercase">{cat}</div>
              <h3 className="text-[14px] text-hp-paper/65 leading-snug mb-6 group-hover:text-hp-paper transition-colors">
                {title}
              </h3>
              <div className="font-mono text-[8px] tracking-widest text-hp-paper/72 uppercase">{date}</div>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── FINAL CTA ───────────────────────────────────────────────────────────────

function FinalCTA() {
  const routes = [
    { role: 'PLAYER', cta: 'CLAIM YOUR CRICKET PASSPORT', accent: 'red' },
    { role: 'COACH', cta: 'STREAMLINE YOUR SQUAD', accent: 'navy' },
    { role: 'ORGANISATION', cta: 'DIGITISE YOUR ASSOCIATION', accent: 'gold' },
  ]

  return (
    <section className="relative bg-hp-ink py-28 overflow-hidden">
      {/* Stadium crowd background */}
      <Image
        src="/hp/final-cta.jpg"
        alt=""
        aria-hidden="true"
        fill
        priority={false}
        sizes="100vw"
        className="object-cover object-top opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-hp-ink/50 via-hp-ink/25 to-hp-ink/70" />
      <div className="relative max-w-[1440px] mx-auto px-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-8">
          <span className="block w-6 h-px bg-hp-cg/50" />
          <span className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">Get started</span>
          <span className="block w-6 h-px bg-hp-cg/50" />
        </div>

        <h2
          className="font-display font-black uppercase text-hp-paper leading-[0.88] mb-6"
          style={{ fontSize: 'clamp(52px, 7.5vw, 100px)' }}
        >
          THE CRICKET<br />JOURNEY,<br />CONNECTED.
        </h2>
        <p className="text-hp-paper/65 text-[16px] mb-8 max-w-md mx-auto">
          From the first ball captured to the next stage of development, CRIC HQ connects the journey.
        </p>
        <div className="flex flex-wrap gap-4 items-center justify-center mb-16">
          <a href="/signup" className="bg-hp-cg text-hp-paper font-display font-black text-sm px-10 py-4 tracking-[0.15em] uppercase hover:bg-hp-cg/90 transition-colors">
            GET STARTED
          </a>
          <a href="#what-is-cric-hq" className="border border-white/25 text-hp-paper font-display font-black text-sm px-10 py-4 tracking-[0.15em] uppercase hover:bg-white/4 hover:border-white/40 transition-colors">
            SEE HOW IT WORKS
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/5 max-w-3xl mx-auto">
          {routes.map(({ role, cta, accent }, idx) => (
            <div
              key={role}
              className="bg-hp-ink flex flex-col items-center gap-5 hover:bg-hp-surface transition-colors"
              style={idx === 0 ? { paddingTop: '32px', paddingBottom: '32px', paddingLeft: '18px', paddingRight: '20px' } : { padding: '32px' }}
            >
              <div className="font-mono text-[9px] tracking-[0.3em] text-hp-paper/52 uppercase">{role}</div>
              <a
                href="#"
                className={`w-full text-center font-display font-black text-sm py-3.5 tracking-widest uppercase transition-colors ${
                  accent === 'gold'
                    ? 'bg-hp-ca text-hp-ink hover:bg-hp-ca/90'
                    : accent === 'navy'
                    ? 'bg-hp-cn text-hp-paper hover:bg-hp-cn/90'
                    : 'bg-hp-cg text-hp-paper hover:bg-hp-cg/90'
                }`}
              >
                {cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── FOOTER ──────────────────────────────────────────────────────────────────

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function HomePageV2() {
  return (
    <div className="min-h-screen bg-hp-ink text-hp-paper">
      <SiteNav />
      <Hero />
      <WhatIsCricHQ />
      <ChooseRoute />
      <AhaMoment />
      <LiveScoring />
      <PlayerPassport />
      <WhyCricHQ />
      <Performance />
      <AISection />
      <CoachesSection />
      <OrganisationsSection />
      <CompetitionsSection />
      <DataFlywheel />
      <ProofSection />
      <InsightsSection />
      <FinalCTA />
      <SiteFooter />
    </div>
  )
}
