import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, BarChart3, Brain, CheckCircle, Code2,
  FileText, MessageSquare, Mic, Shield, Sparkles,
  Star, Target, TrendingUp, Trophy, Users, Video, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: (d = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: d * 0.09, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

const features = [
  { icon: Brain,     title: "Adaptive AI Interviewer",   desc: "Contextual follow-ups and difficulty that adjusts in real time to your answers." },
  { icon: FileText,  title: "Resume-Aware Questions",    desc: "AI reads your resume and targets your actual projects, skills, and experience." },
  { icon: Code2,     title: "Live Coding Rounds",        desc: "Integrated editor with code review, complexity analysis, and AI feedback." },
  { icon: BarChart3, title: "Structured Evaluation",     desc: "Scores across technical depth, communication, confidence, and clarity after each session." },
  { icon: Video,     title: "Virtual Interview Mode",    desc: "Camera + microphone setup with proctoring for a fully realistic interview feel." },
  { icon: Trophy,    title: "Actionable Reports",        desc: "Personalised 4-week study roadmap, ideal answers, and improvement priorities." },
];

const steps = [
  { icon: Target,      n: "01", title: "Configure your round",      desc: "Choose role, level, type, duration, and attach your resume." },
  { icon: MessageSquare,n:"02", title: "Practice in your mode",     desc: "Text, voice, or virtual interview with one focused question at a time." },
  { icon: TrendingUp,  n: "03", title: "Receive structured feedback",desc: "Clear signals on technical depth, clarity, confidence, and next steps." },
];

const testimonials = [
  { name: "Priya Sharma",    role: "SDE-2 candidate",   av: "PS", text: "The follow-up questions felt close to a real technical round. I finally knew which parts of my answers were weak." },
  { name: "Rahul Mehta",     role: "Backend Engineer",  av: "RM", text: "Resume-based questions were the most useful part — it challenged me on exactly the projects I mention in interviews." },
  { name: "Ananya Krishnan", role: "ML Engineer",       av: "AK", text: "Reports made my prep measurable. I could see confidence and communication improve session by session." },
];

const stats    = [{ v: "10 000+", l: "Mock interviews" }, { v: "95%", l: "Satisfaction" }, { v: "50+", l: "Company styles" }, { v: "15+", l: "Role tracks" }];
const companies = ["Google","Amazon","Microsoft","Meta","Netflix","Apple","TCS","Infosys","Accenture","Capgemini"];
const modes    = [{ icon: MessageSquare, label: "Text",    detail: "Typed answers" }, { icon: Mic, label: "Voice", detail: "Spoken practice" }, { icon: Video, label: "Virtual", detail: "Camera setup" }];
const trust    = [{ icon: CheckCircle, text: "No credit card" }, { icon: Shield, text: "Privacy-first" }, { icon: Zap, text: "Ready in 60 seconds" }];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-[#e8daf4] bg-[#fffaf1]/92 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 shadow-[0_6px_18px_rgba(130,90,210,0.18)]">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <span className="font-display text-xl font-normal text-primary tracking-tight">InterviewAI</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            {["features","workflow","roles","stories"].map(s => (
              <a key={s} href={`#${s}`} className="capitalize hover:text-foreground transition-colors">{s}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost" className="hidden sm:inline-flex text-sm">Sign In</Button></Link>
            <Link to="/register">
              <Button className="gap-2 bg-primary text-white shadow-[0_8px_22px_rgba(130,90,210,0.28)] hover:bg-primary/90 text-sm">
                Start Free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-[#ecdff5] py-20 lg:py-28">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-32 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-[100px]" />
            <div className="absolute right-0 top-1/4 h-72 w-72 rounded-full bg-violet-300/10 blur-[80px]" />
          </div>
          <div className="relative mx-auto max-w-7xl px-6 sm:px-8">
            <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
              <motion.div initial="hidden" animate="visible">
                <motion.div variants={fadeUp} custom={0}>
                  <Badge variant="outline" className="mb-6 gap-1.5 border-primary/20 bg-primary/8 px-4 py-1.5 text-primary">
                    <Sparkles className="h-3.5 w-3.5" /> Premium AI interview practice
                  </Badge>
                </motion.div>
                <motion.h1 variants={fadeUp} custom={1}
                  className="font-display text-5xl font-normal leading-[1.05] tracking-tight text-[#1e1230] sm:text-6xl xl:text-[4.2rem]">
                  Practice sharper.<br />
                  <span className="text-gradient">Interview better.</span>
                </motion.h1>
                <motion.p variants={fadeUp} custom={2}
                  className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                  Adaptive AI mock interviews with voice, resume context, live coding, and polished feedback reports — all in one focused platform.
                </motion.p>
                <motion.div variants={fadeUp} custom={3} className="mt-8 flex flex-wrap gap-3">
                  <Link to="/register">
                    <Button size="lg" className="gap-2 bg-primary text-white shadow-[0_14px_32px_rgba(130,90,210,0.30)] hover:bg-primary/90">
                      Start Practicing Free <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button variant="outline" size="lg" className="gap-2 border-[#d9cce8] bg-white/70 shadow-sm">Sign In</Button>
                  </Link>
                </motion.div>
                <motion.div variants={fadeUp} custom={4} className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  {trust.map(({ icon: Icon, text }) => (
                    <span key={text} className="flex items-center gap-1.5"><Icon className="h-4 w-4 text-primary/70" />{text}</span>
                  ))}
                </motion.div>
                <motion.div variants={fadeUp} custom={5}
                  className="mt-8 grid max-w-sm grid-cols-3 overflow-hidden rounded-xl border border-[#e0d4f4] bg-white/60 backdrop-blur">
                  {stats.slice(0,3).map(({ v, l }) => (
                    <div key={l} className="border-r border-[#ecdff5] px-4 py-3 last:border-r-0">
                      <p className="font-display text-xl font-normal text-[#1e1230]">{v}</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{l}</p>
                    </div>
                  ))}
                </motion.div>
              </motion.div>

              {/* Hero card */}
              <motion.div initial={{ opacity:0, x:28, scale:0.97 }} animate={{ opacity:1, x:0, scale:1 }}
                transition={{ delay:0.22, duration:0.65, ease:[0.22,1,0.36,1] }}
                className="card-surface w-full overflow-hidden lg:justify-self-end">
                <div className="border-b border-[#ecdff5] bg-[#fffaf1]/90 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-primary/70">AI Interview Platform</p>
                      <p className="mt-1 text-sm font-semibold text-[#1e1230]">Configure, practise, and improve in one flow</p>
                    </div>
                    <Badge variant="outline" className="border-primary/20 bg-primary/8 text-primary text-xs">Preview</Badge>
                  </div>
                </div>
                <div className="space-y-4 p-5">
                  <div className="rounded-xl border border-primary/18 bg-primary/7 p-5">
                    <p className="mb-4 text-sm font-bold text-[#1e1230]">Practice mode</p>
                    <div className="grid grid-cols-3 gap-3">
                      {modes.map(({ icon: Icon, label, detail }) => (
                        <div key={label} className="rounded-lg border border-[#e0d4f4] bg-white/80 p-3">
                          <Icon className="mb-2 h-4 w-4 text-primary" />
                          <p className="text-sm font-bold text-[#1e1230]">{label}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#e8daf4] bg-white/75 p-5">
                    <p className="mb-3 text-sm font-bold text-[#1e1230]">Round types</p>
                    <div className="grid grid-cols-2 gap-2">
                      {["Technical","HR / Behavioral","Live Coding","Company-specific"].map(l => (
                        <div key={l} className="flex items-center gap-2 rounded-lg bg-[#fdf8f2]/90 px-3 py-2 border border-[#ecdff5]">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                          <span className="text-xs font-semibold text-[#1e1230]">{l}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Company bar ── */}
        <section className="border-b border-[#ecdff5] bg-[#fffaf1]/50 py-6">
          <div className="mx-auto max-w-7xl px-6">
            <p className="mb-4 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground/70">Company-specific prep for</p>
            <div className="flex flex-wrap justify-center gap-2">
              {companies.map(c => (
                <span key={c} className="rounded-full border border-[#e0d4f4] bg-white/70 px-4 py-1.5 text-sm font-semibold text-muted-foreground backdrop-blur hover:border-primary/30 transition-colors">{c}</span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="py-20" id="features">
          <div className="mx-auto max-w-7xl px-6 sm:px-8">
            <SectionHeader eyebrow="Platform capabilities" title="Everything a modern AI coach needs"
              text="Premium practice should feel structured, repeatable, and calm. InterviewAI keeps the workflow focused from first setup to final report." />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, desc }, i) => (
                <motion.div key={title} initial={{ opacity:0, y:18 }} whileInView={{ opacity:1, y:0 }}
                  viewport={{ once:true }} transition={{ delay:i*0.05 }} whileHover={{ y:-4 }}
                  className="card-surface-hover p-6">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/18 bg-gradient-to-br from-primary/12 to-white/60 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-lg font-normal text-[#1e1230]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p>
                  <div className="mt-5 h-px rounded-full bg-gradient-to-r from-primary/40 via-violet-300/35 to-transparent" />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Workflow ── */}
        <section className="border-y border-[#ecdff5] bg-[#fffaf1]/50 py-20" id="workflow">
          <div className="mx-auto max-w-7xl px-6 sm:px-8">
            <SectionHeader eyebrow="How it works" title="A premium prep loop that stays simple"
              text="The interface keeps candidates focused while AI handles question flow, feedback structure, and progress tracking." />
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {steps.map(({ icon: Icon, n, title, desc }, i) => (
                <motion.div key={title} initial={{ opacity:0, y:16 }} whileInView={{ opacity:1, y:0 }}
                  viewport={{ once:true }} transition={{ delay:i*0.07 }}
                  className="card-surface p-7">
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-[0_10px_22px_rgba(130,90,210,0.25)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-display text-2xl font-normal text-primary/25">{n}</span>
                  </div>
                  <h3 className="font-display text-xl font-normal text-[#1e1230]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="py-14">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stats.map(({ v, l }) => (
                <div key={l} className="card-surface p-6 text-center">
                  <p className="font-display text-4xl font-normal text-primary">{v}</p>
                  <p className="mt-1.5 text-sm font-semibold text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Testimonials ── */}
        <section className="border-y border-[#ecdff5] bg-[#fffaf1]/48 py-20" id="stories">
          <div className="mx-auto max-w-7xl px-6 sm:px-8">
            <SectionHeader eyebrow="Success stories" title="Candidates who practised with purpose"
              text="The goal is not hype — it is clearer repetition, better answers, and feedback that actually helps." />
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {testimonials.map(({ name, role, av, text }, i) => (
                <motion.div key={name} initial={{ opacity:0, y:16 }} whileInView={{ opacity:1, y:0 }}
                  viewport={{ once:true }} transition={{ delay:i*0.08 }}
                  className="card-surface p-7 flex flex-col">
                  <div className="mb-4 flex gap-0.5 text-amber-400">
                    {[0,1,2,3,4].map(s => <Star key={s} className="h-4 w-4 fill-current" />)}
                  </div>
                  <p className="flex-1 text-sm leading-7 text-muted-foreground">"{text}"</p>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-xs font-bold text-white shadow-[0_6px_14px_rgba(130,90,210,0.28)]">{av}</div>
                    <div>
                      <p className="text-sm font-bold text-[#1e1230]">{name}</p>
                      <p className="text-xs text-muted-foreground">{role}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-20 px-6">
          <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-primary/18 bg-gradient-to-br from-primary/9 via-white/75 to-violet-100/50 p-10 text-center shadow-[0_24px_64px_rgba(130,90,210,0.12)] backdrop-blur">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-white shadow-[0_12px_28px_rgba(130,90,210,0.28)]">
              <Sparkles className="h-6 w-6" />
            </div>
            <h2 className="font-display text-4xl font-normal tracking-tight text-[#1e1230]">Ready for a better practice session?</h2>
            <p className="mx-auto mt-4 max-w-lg text-base text-muted-foreground">
              Create a free account, pick a role, and start a focused AI mock interview today.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/register">
                <Button size="lg" className="w-full gap-2 bg-primary text-white shadow-[0_12px_28px_rgba(130,90,210,0.28)] hover:bg-primary/90 sm:w-auto">
                  Create Free Account <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" size="lg" className="w-full bg-white/70 sm:w-auto">Sign In</Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[#ecdff5] bg-[#fffaf1]/70 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white"><Brain className="h-4 w-4" /></div>
            <span className="font-display text-lg font-normal text-[#1e1230]">InterviewAI</span>
          </div>
          <p>Built with FastAPI · LangGraph · React · Groq</p>
          <div className="flex gap-4">
            <Link to="/login" className="hover:text-foreground transition-colors">Sign In</Link>
            <Link to="/register" className="hover:text-foreground transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHeader({ eyebrow, title, text, align = "center" }: {
  eyebrow: string; title: string; text: string; align?: "center"|"left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className="section-eyebrow">{eyebrow}</p>
      <h2 className="section-title mt-3">{title}</h2>
      <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">{text}</p>
    </div>
  );
}
