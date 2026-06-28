import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, LayoutDashboard, History, Settings, Menu, X,
  LogOut, User, ChevronDown, Video, Plus,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { to: "/dashboard",     label: "Dashboard",  icon: LayoutDashboard },
  { to: "/interview/new", label: "New Interview", icon: Plus },
  { to: "/history",       label: "History",     icon: History },
  { to: "/settings",      label: "Settings",    icon: Settings },
];

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.username?.[0]?.toUpperCase() ?? "U";

  return (
    <>
      <nav
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          scrolled
            ? "bg-[#fffaf1]/92 backdrop-blur-xl border-b border-[#dacceb] shadow-[0_10px_32px_rgba(97,63,139,0.10)]"
            : "bg-[#fffaf1]/78 backdrop-blur-md border-b border-[#e4d8ef]"
        )}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <NavLink to="/dashboard" className="flex items-center gap-2.5 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/25 group-hover:bg-primary/20 group-hover:border-primary/40 transition-all duration-200 shadow-[0_10px_22px_rgba(132,87,211,0.18)]">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <span className="font-display text-xl font-normal text-primary hidden sm:block tracking-tight">InterviewAI</span>
            </NavLink>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/55"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "")} />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>

            {/* User menu + mobile toggle */}
            <div className="flex items-center gap-2">
              {/* User dropdown */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-white/60 transition-colors border border-transparent hover:border-primary/20"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white text-xs font-bold shadow-[0_8px_18px_rgba(132,87,211,0.28)]">
                    {initials}
                  </div>
                  <span className="text-sm text-foreground hidden sm:block max-w-[100px] truncate">
                    {user?.full_name?.split(" ")[0] || user?.username}
                  </span>
                  <ChevronDown className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                    userMenuOpen && "rotate-180"
                  )} />
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-border bg-card shadow-2xl backdrop-blur-xl overflow-hidden z-50"
                      onMouseLeave={() => setUserMenuOpen(false)}
                    >
                      <div className="px-3 py-3 border-b border-border">
                        <p className="text-xs font-semibold text-foreground">{user?.full_name || user?.username}</p>
                        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                      </div>
                      <div className="p-1.5 space-y-0.5">
                        <button
                          onClick={() => { navigate("/settings"); setUserMenuOpen(false); }}
                          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <User className="h-4 w-4" /> Profile Settings
                        </button>
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                        >
                          <LogOut className="h-4 w-4" /> Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Mobile toggle */}
              <button
                className="md:hidden flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/60 transition-colors"
                onClick={() => setMobileOpen((v) => !v)}
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden border-t border-border bg-card/95"
            >
              <div className="px-4 py-3 space-y-1">
                {NAV_LINKS.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/60"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "")} />
                        {label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Spacer for fixed navbar */}
      <div className="h-16" />
    </>
  );
}
