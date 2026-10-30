import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react"
import { useAuth } from "./auth/AuthContext"
import { LoginPage } from "./auth/LoginPage"
import filmdappaLogo from "./assets/filmdappa-logo.jpg"
import {
  FINANCIAL_MONTHS,
  INITIAL_MONTH_KEY,
  MIN_FINANCIAL_DATE,
  MAX_FINANCIAL_DATE,
  getMonthByKey,
  getPrevMonthKey,
  getNextMonthKey,
  isValidFinancialDate,
  dateIsInMonth,
  formatDateDisplay,
  formatMoney,
} from "./lib/calendar"
import {
  ClientRecord,
  ClientPaymentRecord,
  ExpenseRecord,
  StaffRecord,
  StaffPaymentRecord,
  DeliverableRecord,
  CompanySettings,
  AuditRecord,
  DEFAULT_SETTINGS,
  isStaffSalaryExpense,
  expenseMatchesStaff,
  fetchClients,
  createClient,
  updateClient,
  deleteClient,
  fetchClientPayments,
  createClientPayment,
  deleteClientPayment,
  fetchExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  fetchStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  fetchStaffPayments,
  createStaffPayment,
  deleteStaffPayment,
  fetchDeliverables,
  createDeliverable,
  updateDeliverableStatus,
  deleteDeliverable,
  fetchCompanySettings,
  saveCompanySettings,
  fetchAuditLogs,
  logCrmAction,
} from "./lib/crmData"
import {
  downloadPdfReport,
  openPrintableReport,
  ReportType,
} from "./lib/pdfReportGenerator"

type Page =
  | "Dashboard"
  | "Clients"
  | "Add Client"
  | "Expenses"
  | "Staff"
  | "Monthly Reports"
  | "Audit Logs"
  | "Settings"

type IconName =
  | "dashboard"
  | "clients"
  | "expenses"
  | "staff"
  | "reports"
  | "audit"
  | "settings"
  | "search"
  | "plus"
  | "arrow"
  | "calendar"
  | "download"
  | "logout"
  | "menu"
  | "close"
  | "wallet"
  | "check"
  | "clock"
  | "briefcase"
  | "edit"
  | "trash"

const nav: { label: Page; icon: IconName }[] = [
  { label: "Dashboard", icon: "dashboard" },
  { label: "Clients", icon: "clients" },
  { label: "Expenses", icon: "expenses" },
  { label: "Staff", icon: "staff" },
  { label: "Monthly Reports", icon: "reports" },
  { label: "Audit Logs", icon: "audit" },
  { label: "Settings", icon: "settings" },
]

function parseRouteFromUrl(): {
  page: Page
  clientId: string | null
  staffId: string | null
} {
  try {
    const path = (window.location.pathname || "").toLowerCase()
    const hash = (window.location.hash || "").replace(/^#\/?/, "").toLowerCase()
    const search = new URLSearchParams(window.location.search || "")
    const action = (search.get("action") || "").toLowerCase()
    const pParam = (search.get("page") || "").toLowerCase()

    // 1. Add Client direct routes
    if (
      path === "/add-client" ||
      path === "/clients/new" ||
      hash === "add-client" ||
      hash === "clients/new" ||
      action === "add-client" ||
      action === "new-client"
    ) {
      return { page: "Add Client", clientId: null, staffId: null }
    }

    // 2. Client Details: /clients/:id or #clients/:id
    const clientMatch = path.match(/^\/clients\/([^/]+)$/) || hash.match(/^clients\/([^/]+)$/)
    if (clientMatch && clientMatch[1] !== "new") {
      return { page: "Clients", clientId: decodeURIComponent(clientMatch[1]), staffId: null }
    }

    // 3. Staff Details: /staff/:id or #staff/:id
    const staffMatch = path.match(/^\/staff\/([^/]+)$/) || hash.match(/^staff\/([^/]+)$/)
    if (staffMatch && staffMatch[1] !== "new") {
      return { page: "Staff", staffId: decodeURIComponent(staffMatch[1]), clientId: null }
    }

    // 4. Standalone Pages
    if (path === "/expenses" || hash === "expenses" || pParam === "expenses") {
      return { page: "Expenses", clientId: null, staffId: null }
    }
    if (path === "/staff" || hash === "staff" || pParam === "staff") {
      return { page: "Staff", clientId: null, staffId: null }
    }
    if (
      path === "/reports" ||
      path === "/monthly-reports" ||
      hash === "reports" ||
      hash === "monthly-reports" ||
      pParam === "reports"
    ) {
      return { page: "Monthly Reports", clientId: null, staffId: null }
    }
    if (path === "/audit" || path === "/audit-logs" || hash === "audit" || hash === "audit-logs" || pParam === "audit") {
      return { page: "Audit Logs", clientId: null, staffId: null }
    }
    if (path === "/settings" || hash === "settings" || pParam === "settings") {
      return { page: "Settings", clientId: null, staffId: null }
    }
    if (path === "/clients" || hash === "clients" || pParam === "clients") {
      return { page: "Clients", clientId: null, staffId: null }
    }
  } catch {
    // Fallback to Dashboard on any parsing error
  }

  return { page: "Dashboard", clientId: null, staffId: null }
}

function updateBrowserUrl(page: Page, clientId?: string | null, staffId?: string | null) {
  try {
    let url = "/"
    if (page === "Add Client") {
      url = "/clients/new"
    } else if (clientId) {
      url = `/clients/${encodeURIComponent(clientId)}`
    } else if (staffId) {
      url = `/staff/${encodeURIComponent(staffId)}`
    } else if (page === "Clients") {
      url = "/clients"
    } else if (page === "Expenses") {
      url = "/expenses"
    } else if (page === "Staff") {
      url = "/staff"
    } else if (page === "Monthly Reports") {
      url = "/reports"
    } else if (page === "Audit Logs") {
      url = "/audit-logs"
    } else if (page === "Settings") {
      url = "/settings"
    }

    if (window.location.pathname !== url && window.location.hash !== `#${url}`) {
      window.history.pushState({ page, clientId, staffId }, "", url)
    }
  } catch {
    // Browser environment fallback
  }
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    clients: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    expenses: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20M17 15h.01" />
      </>
    ),
    staff: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    reports: (
      <>
        <path d="M4 19V9M10 19V5M16 19v-7M22 19V2" />
      </>
    ),
    audit: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63h.01A1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9v.01A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    arrow: (
      <>
        <path d="m9 18 6-6-6-6" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    wallet: (
      <>
        <path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6" />
        <path d="M16 13h.01" />
      </>
    ),
    check: (
      <>
        <path d="m5 12 4 4L19 6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
      </>
    ),
    edit: (
      <>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function Button({
  children,
  onClick,
  variant = "dark",
  type = "button",
  icon,
  disabled = false,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "dark" | "light" | "outline" | "danger"
  type?: "button" | "submit"
  icon?: IconName
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`btn btn-${variant}`}
    >
      {icon && <Icon name={icon} size={16} />}
      <span>{children}</span>
    </button>
  )
}

function Status({ children }: { children: ReactNode }) {
  return (
    <span className="status">
      <span className="status-dot" />
      {children}
    </span>
  )
}

function Field({
  label,
  placeholder,
  type = "text",
  required = false,
  value,
  onChange,
  min,
  max,
  isTextArea = false,
  rows = 3,
}: {
  label: string
  placeholder?: string
  type?: string
  required?: boolean
  value?: string | number
  onChange?: (val: string) => void
  min?: string | number
  max?: string | number
  isTextArea?: boolean
  rows?: number
}) {
  return (
    <label className={`field ${isTextArea ? "field-full" : ""}`}>
      <span>
        {label}
        {required && <span className="required-star">*</span>}
      </span>
      {isTextArea ? (
        <textarea
          placeholder={placeholder}
          required={required}
          value={value ?? ""}
          rows={rows}
          onChange={(e) => onChange && onChange(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            outline: 0,
            background: "var(--white)",
            fontSize: 11,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
      ) : (
        <input
          type={type}
          placeholder={placeholder}
          required={required}
          value={value ?? ""}
          onChange={(e) => onChange && onChange(e.target.value)}
          min={min}
          max={max}
        />
      )}
    </label>
  )
}

function SelectField({
  label,
  options,
  value,
  onChange,
  required = false,
}: {
  label: string
  options: { label: string; value: string }[] | string[]
  value?: string
  onChange?: (val: string) => void
  required?: boolean
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <span className="required-star">*</span>}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange && onChange(e.target.value)}
        required={required}
      >
        {options.map((opt) => {
          const val = typeof opt === "string" ? opt : opt.value
          const lbl = typeof opt === "string" ? opt : opt.label
          return (
            <option key={val} value={val}>
              {lbl}
            </option>
          )
        })}
      </select>
    </label>
  )
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

function Search({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="search">
      <Icon name="search" size={17} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

// ─── Month Navigation Component ─────────────────────────────────────────────

function MonthNavigator({
  selectedMonth,
  onChange,
}: {
  selectedMonth: string
  onChange: (monthKey: string) => void
}) {
  const prevKey = getPrevMonthKey(selectedMonth)
  const nextKey = getNextMonthKey(selectedMonth)

  return (
    <div className="month-nav">
      <button
        type="button"
        className="month-nav-btn"
        title="Previous month"
        disabled={!prevKey}
        onClick={() => prevKey && onChange(prevKey)}
      >
        ‹
      </button>
      <label className="month-select">
        <Icon name="calendar" size={16} />
        <select
          value={selectedMonth}
          onChange={(e) => onChange(e.target.value)}
        >
          {FINANCIAL_MONTHS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="month-nav-btn"
        title="Next month"
        disabled={!nextKey}
        onClick={() => nextKey && onChange(nextKey)}
      >
        ›
      </button>
    </div>
  )
}

// ─── Cash Flow Chart ────────────────────────────────────────────────────────

function CashFlowChart({
  selectedMonth,
  payments = [],
  expenses = [],
  staffPayments = [],
  currency,
}: {
  selectedMonth: string
  payments: ClientPaymentRecord[]
  expenses: ExpenseRecord[]
  staffPayments?: StaffPaymentRecord[]
  currency: string
}) {
  const curIdx = FINANCIAL_MONTHS.findIndex((m) => m.key === selectedMonth)
  const startIdx = Math.max(0, curIdx - 5)
  const slice = FINANCIAL_MONTHS.slice(startIdx, curIdx + 1)

  const data = slice.map((m) => {
    const inc = payments
      .filter((p) => dateIsInMonth(p.payment_date, m.key))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const ledgerExp = expenses
      .filter((e) => dateIsInMonth(e.date, m.key))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0)
    const legacyExp = staffPayments
      .filter(
        (sp) =>
          dateIsInMonth(sp.payment_date, m.key) &&
          !expenses.some(
            (e) =>
              e.id === sp.id ||
              (e.date === sp.payment_date &&
                Number(e.amount) === Number(sp.amount) &&
                isStaffSalaryExpense(e)),
          ),
      )
      .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)
    const exp = ledgerExp + legacyExp
    return { month: m.shortMonth, income: inc, expense: exp }
  })

  const maxVal = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 0)

  if (maxVal === 0) {
    return (
      <div className="empty-box" style={{ minHeight: 215 }}>
        <Icon name="calendar" size={26} />
        <strong>No financial data yet</strong>
        <p>No income or expenses recorded for this period in Supabase.</p>
      </div>
    )
  }

  return (
    <div className="chart">
      <div className="chart-y">
        <span>{formatMoney(maxVal, currency)}</span>
        <span>{formatMoney(maxVal * 0.75, currency)}</span>
        <span>{formatMoney(maxVal * 0.5, currency)}</span>
        <span>{formatMoney(maxVal * 0.25, currency)}</span>
        <span>{formatMoney(0, currency)}</span>
      </div>
      <div className="chart-area">
        {[0, 1, 2, 3, 4].map((i) => (
          <div className="grid-line" key={i} />
        ))}
        <div className="bars">
          {data.map((d, i) => {
            const incHeight = maxVal > 0 ? (d.income / maxVal) * 100 : 0
            const expHeight = maxVal > 0 ? (d.expense / maxVal) * 100 : 0
            return (
              <div className="bar-group" key={i}>
                <div
                  className="bar income"
                  title={`Income: ${formatMoney(d.income, currency)}`}
                  style={{ height: `${Math.max(incHeight, 2)}%` }}
                />
                <div
                  className="bar expense"
                  title={`Expense: ${formatMoney(d.expense, currency)}`}
                  style={{ height: `${Math.max(expHeight, 2)}%` }}
                />
                <span>{d.month}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard Component ────────────────────────────────────────────────────

function Dashboard({
  openPage,
  selectedMonth,
  onMonthChange,
  clients = [],
  payments = [],
  expenses = [],
  staffPayments = [],
  currency,
  userName,
}: {
  openPage: (page: Page) => void
  selectedMonth: string
  onMonthChange: (monthKey: string) => void
  clients: ClientRecord[]
  payments: ClientPaymentRecord[]
  expenses: ExpenseRecord[]
  staffPayments: StaffPaymentRecord[]
  currency: string
  userName: string
}) {
  const currentMonthInfo = getMonthByKey(selectedMonth)

  const activeClientsInMonth = clients.filter((c) => {
    if (c.status === "Inactive") return false
    return (
      c.start_date <= currentMonthInfo.endDate &&
      c.end_date >= currentMonthInfo.startDate
    )
  })

  const totalClientRevenue = activeClientsInMonth.reduce(
    (sum, c) => sum + Number(c.amount || 0),
    0,
  )

  // Total Income = Actual cash received from clients in the selected month
  const monthPayments = payments.filter((p) =>
    dateIsInMonth(p.payment_date, selectedMonth),
  )
  const totalIncome = monthPayments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0,
  )
  const totalReceived = totalIncome

  const pendingPayments = Math.max(0, totalClientRevenue - totalIncome)

  // Expenses recorded in the ledger for this month (including operating costs and Staff Salary)
  const monthExpenses = expenses.filter((e) =>
    dateIsInMonth(e.date, selectedMonth),
  )
  const totalExpensesFromLedger = monthExpenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0,
  )

  // Legacy staff payments: count only if not already tracked in the expenses ledger
  const legacyMonthStaffPayments = staffPayments.filter(
    (sp) =>
      dateIsInMonth(sp.payment_date, selectedMonth) &&
      !expenses.some(
        (e) =>
          e.id === sp.id ||
          (e.date === sp.payment_date &&
            Number(e.amount) === Number(sp.amount) &&
            isStaffSalaryExpense(e)),
      ),
  )
  const legacyStaffTotal = legacyMonthStaffPayments.reduce(
    (sum, sp) => sum + Number(sp.amount || 0),
    0,
  )

  // Total Expenses includes Staff Salary exactly once
  const totalExpenses = totalExpensesFromLedger + legacyStaffTotal

  // Net Income = Total Income − Total Expenses
  const netIncome = totalIncome - totalExpenses

  const profitMargin =
    totalIncome > 0
      ? ((netIncome / totalIncome) * 100).toFixed(1) + "% margin"
      : "0% margin"

  // Staff Salary & compensation metrics
  const staffSalaryExpenses = monthExpenses.filter((e) => isStaffSalaryExpense(e))
  const staffPaid =
    staffSalaryExpenses
      .filter((e) => e.status === "Paid")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
    legacyMonthStaffPayments
      .filter((sp) => sp.status === "Paid")
      .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

  const staffPending =
    staffSalaryExpenses
      .filter((e) => e.status === "Pending")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
    legacyMonthStaffPayments
      .filter((sp) => sp.status === "Pending")
      .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

  const totalStaffSalary = staffPaid + staffPending

  const collectionRate =
    totalClientRevenue > 0
      ? Math.min(100, Math.round((totalIncome / totalClientRevenue) * 100))
      : 0

  const summaries = [
    [
      "Total Client Revenue",
      formatMoney(totalClientRevenue, currency),
      `${activeClientsInMonth.length} active client${activeClientsInMonth.length === 1 ? "" : "s"}`,
      "briefcase",
    ],
    [
      "Total Amount Received",
      formatMoney(totalIncome, currency),
      `${collectionRate}% collected`,
      "check",
    ],
    [
      "Pending Client Payments",
      formatMoney(pendingPayments, currency),
      pendingPayments > 0 ? "Balance remaining" : "No balance due",
      "clock",
    ],
    [
      "Total Expenses",
      formatMoney(totalExpenses, currency),
      `${currentMonthInfo.shortMonth} operating & salary costs`,
      "expenses",
    ],
    [
      "Staff Salaries & Payments",
      formatMoney(totalStaffSalary, currency),
      `${formatMoney(staffPending, currency)} pending`,
      "staff",
    ],
    [
      "Net Income",
      formatMoney(netIncome, currency),
      `${profitMargin} · Net Income = Total Income − Total Expenses`,
      "wallet",
    ],
  ] as const

  const recentActivities = useMemo(() => {
    const list: {
      title: string
      sub: string
      amt: string
      date: string
      isPositive: boolean
    }[] = []

    monthPayments.forEach((p) => {
      const client = clients.find((c) => c.id === p.client_id)
      list.push({
        title: "Payment received",
        sub: client?.business || p.reference || "Client payment",
        amt: formatMoney(p.amount, currency),
        date: formatDateDisplay(p.payment_date),
        isPositive: true,
      })
    })

    monthExpenses.forEach((e) => {
      list.push({
        title: "Expense recorded",
        sub: `${e.category} — ${e.recipient}`,
        amt: formatMoney(e.amount, currency),
        date: formatDateDisplay(e.date),
        isPositive: false,
      })
    })

    return list.slice(0, 4)
  }, [monthPayments, monthExpenses, clients, currency])

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`${getGreeting()}, ${userName}.`}
        description="Here’s how Filmdappa Media is performing this month."
        action={
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={onMonthChange}
          />
        }
      />

      <section className="summary-grid">
        {summaries.map(([label, value, detail, icon], index) => (
          <article
            className={`summary-card ${index === 5 ? "highlight" : ""}`}
            key={label}
          >
            <div className="card-top">
              <span>{label}</span>
              <span className="icon-box">
                <Icon name={icon} />
              </span>
            </div>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Income vs. expenses</h2>
              <p>Monthly cash flow overview</p>
            </div>
            <div className="legend">
              <span>
                <i className="legend-income" />
                Income
              </span>
              <span>
                <i className="legend-expense" />
                Expenses
              </span>
            </div>
          </div>
          <CashFlowChart
            selectedMonth={selectedMonth}
            payments={payments}
            expenses={expenses}
            staffPayments={staffPayments}
            currency={currency}
          />
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Payment overview</h2>
              <p>Current month collections</p>
            </div>
          </div>
          <div className="donut-row">
            <div
              className="donut"
              style={{
                background: `conic-gradient(var(--black) 0 ${collectionRate}%, var(--yellow) ${collectionRate}% 100%)`,
              }}
            >
              <div>
                <strong>{collectionRate}%</strong>
                <span>received</span>
              </div>
            </div>
            <div className="donut-info">
              <span>
                Received<strong>{formatMoney(totalReceived, currency)}</strong>
              </span>
              <span>
                Pending<strong>{formatMoney(pendingPayments, currency)}</strong>
              </span>
            </div>
          </div>
          <button className="text-link" onClick={() => openPage("Clients")}>
            View client payments <Icon name="arrow" size={15} />
          </button>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent activity</h2>
            <p>Latest financial updates for {currentMonthInfo.label}</p>
          </div>
          <button className="text-link" onClick={() => openPage("Audit Logs")}>
            View audit logs <Icon name="arrow" size={15} />
          </button>
        </div>
        {recentActivities.length === 0 ? (
          <div className="empty-box" style={{ padding: "30px 20px" }}>
            <p>No recent activity recorded yet for this month.</p>
          </div>
        ) : (
          <div className="activity-list">
            {recentActivities.map((act, i) => (
              <div className="activity" key={i}>
                <span className="activity-icon">
                  <Icon name={act.isPositive ? "check" : "expenses"} size={17} />
                </span>
                <span>
                  <strong>{act.title}</strong>
                  <small>{act.sub}</small>
                </span>
                <span className="activity-amount">
                  <strong>{act.amt}</strong>
                  <small>{act.date}</small>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

// ─── Add Client Page Component ──────────────────────────────────────────────

function AddClientPage({
  onCancel,
  onClientCreated,
  currency,
  selectedMonth,
}: {
  onCancel: () => void
  onClientCreated: (client: ClientRecord) => void
  currency: string
  selectedMonth: string
}) {
  const currentMonthInfo = getMonthByKey(selectedMonth)
  const defaultDate = `${selectedMonth}-01`

  const [cName, setCName] = useState("")
  const [cBusiness, setCBusiness] = useState("")
  const [cPhone, setCPhone] = useState("+91 ")
  const [cAmount, setCAmount] = useState("")
  const [cVideos, setCVideos] = useState("")
  const [cPosters, setCPosters] = useState("")
  const [cStart, setCStart] = useState(defaultDate)
  const [cEnd, setCEnd] = useState(currentMonthInfo.endDate)
  const [cStatus, setCStatus] = useState<"Active" | "Ending soon" | "Inactive">("Active")
  const [cNotes, setCNotes] = useState("")

  const [err, setErr] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return

    setErr("")

    // Comprehensive validations
    if (!cName.trim()) {
      setErr("Client contact name is required.")
      return
    }
    if (!cBusiness.trim()) {
      setErr("Business / company name is required.")
      return
    }
    if (!isValidFinancialDate(cStart)) {
      setErr(`Start date must be between ${MIN_FINANCIAL_DATE} and ${MAX_FINANCIAL_DATE}.`)
      return
    }
    if (!isValidFinancialDate(cEnd)) {
      setErr(`End date must be between ${MIN_FINANCIAL_DATE} and ${MAX_FINANCIAL_DATE}.`)
      return
    }
    if (cStart > cEnd) {
      setErr("Agreement start date cannot be after the end date.")
      return
    }

    const amt = parseFloat(cAmount) || 0
    if (amt < 0) {
      setErr("Monthly package amount cannot be negative.")
      return
    }

    const vids = parseInt(cVideos, 10) || 0
    if (vids < 0) {
      setErr("Videos per month cannot be negative.")
      return
    }

    const posts = parseInt(cPosters, 10) || 0
    if (posts < 0) {
      setErr("Posters per month cannot be negative.")
      return
    }

    setSubmitting(true)
    try {
      const newClient = await createClient({
        name: cName.trim(),
        business: cBusiness.trim(),
        phone: cPhone.trim(),
        amount: amt,
        videos: vids,
        posters: posts,
        start_date: cStart,
        end_date: cEnd,
        status: cStatus,
        notes: cNotes.trim(),
      })
      await logCrmAction(
        "User",
        "Client Added",
        `Registered client: ${cBusiness.trim()}`,
        formatMoney(amt, currency),
      )
      onClientCreated(newClient)
    } catch (error: any) {
      setErr(error?.message || "Failed to create client in Supabase.")
      setSubmitting(false)
    }
  }

  return (
    <>
      <button className="back-link" onClick={onCancel} type="button">
        ‹ Back to clients
      </button>

      <PageHeader
        eyebrow="Client Management"
        title="Add New Client"
        description="Register a new client package agreement with billing and deliverable targets in Supabase."
        action={
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        }
      />

      <div style={{ maxWidth: 840 }}>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Client Agreement Information</h2>
              <p>Fields marked with an asterisk (*) are required.</p>
            </div>
            <Status>{cStatus}</Status>
          </div>

          {err && (
            <div
              style={{
                padding: "12px 16px",
                marginBottom: 20,
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                color: "#b91c1c",
                borderRadius: 9,
                fontSize: 13,
                lineHeight: 1.5,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
              role="alert"
            >
              <strong>Error:</strong>
              <span>{err}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="form-grid">
            <Field
              label="Client contact name"
              placeholder="e.g. Rahul Sharma"
              value={cName}
              onChange={setCName}
              required
            />
            <Field
              label="Business / company name"
              placeholder="e.g. Northstar Media"
              value={cBusiness}
              onChange={setCBusiness}
              required
            />
            <Field
              label="Phone number"
              placeholder="+91 98765 43210"
              value={cPhone}
              onChange={setCPhone}
            />
            <Field
              label="Monthly package amount (₹)"
              type="number"
              placeholder="0"
              value={cAmount}
              onChange={setCAmount}
              required
              min={0}
            />
            <Field
              label="Videos per month"
              type="number"
              placeholder="0"
              value={cVideos}
              onChange={setCVideos}
              min={0}
            />
            <Field
              label="Posters per month"
              type="number"
              placeholder="0"
              value={cPosters}
              onChange={setCPosters}
              min={0}
            />
            <Field
              label="Agreement start date"
              type="date"
              value={cStart}
              onChange={setCStart}
              min={MIN_FINANCIAL_DATE}
              max={MAX_FINANCIAL_DATE}
              required
            />
            <Field
              label="Agreement end date"
              type="date"
              value={cEnd}
              onChange={setCEnd}
              min={MIN_FINANCIAL_DATE}
              max={MAX_FINANCIAL_DATE}
              required
            />
            <SelectField
              label="Account status"
              value={cStatus}
              options={["Active", "Ending soon", "Inactive"]}
              onChange={(val) =>
                setCStatus(val as "Active" | "Ending soon" | "Inactive")
              }
            />
            <Field
              label="Notes / Project details (optional)"
              placeholder="Important project notes, deliverable scope or custom terms"
              value={cNotes}
              onChange={setCNotes}
              isTextArea
              rows={3}
            />

            <div className="form-actions">
              <Button variant="outline" onClick={onCancel} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving to Supabase..." : "Create Client"}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </>
  )
}

// ─── Clients Page Component ─────────────────────────────────────────────────

function Clients({
  clients,
  openClient,
  openAddClient,
  openModal,
  currency,
}: {
  clients: ClientRecord[]
  openClient: (id: string) => void
  openAddClient: () => void
  openModal: (type: string) => void
  currency: string
}) {
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("All statuses")

  const filtered = clients.filter((c) => {
    const matchesQuery = `${c.name || ""} ${c.business || ""}`
      .toLowerCase()
      .includes(query.toLowerCase())
    const matchesStatus =
      statusFilter === "All statuses" || c.status === statusFilter
    return matchesQuery && matchesStatus
  })

  return (
    <>
      <PageHeader
        eyebrow="Client management"
        title="Clients"
        description="Manage packages, payments and monthly deliverables."
        action={
          <Button icon="plus" onClick={openAddClient}>
            Add client
          </Button>
        }
      />
      <div className="toolbar">
        <Search
          value={query}
          onChange={setQuery}
          placeholder="Search clients or businesses"
        />
        <label className="compact-select">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option>All statuses</option>
            <option>Active</option>
            <option>Ending soon</option>
            <option>Inactive</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-box panel">
          <Icon name="clients" size={32} />
          <strong>No clients added yet</strong>
          <p>
            Click "Add client" to create your first client agreement in
            Supabase.
          </p>
          <div style={{ marginTop: 12 }}>
            <Button icon="plus" onClick={openAddClient}>
              Add client
            </Button>
          </div>
        </div>
      ) : (
        <section className="client-grid">
          {filtered.map((client) => {
            const initials =
              client.business
                .split(" ")
                .map((word) => word[0])
                .slice(0, 2)
                .join("")
                .toUpperCase() || "CL"

            return (
              <button
                className="client-card"
                key={client.id}
                onClick={() => openClient(client.id)}
              >
                <div className="client-card-head">
                  <span className="avatar">{initials}</span>
                  <Status>{client.status}</Status>
                </div>
                <h2>{client.business}</h2>
                <p>
                  {client.name} · {client.phone}
                </p>
                {client.notes ? (
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    {client.notes}
                  </p>
                ) : null}
                <div className="package-row">
                  <span>
                    Monthly package
                    <strong>{formatMoney(client.amount, currency)}</strong>
                  </span>
                  <span>
                    Period
                    <strong>
                      {formatDateDisplay(client.start_date)} —{" "}
                      {formatDateDisplay(client.end_date)}
                    </strong>
                  </span>
                </div>
                <div className="deliverables">
                  <span>
                    <b>{client.videos}</b> videos / month
                  </span>
                  <span>
                    <b>{client.posters}</b> posters / month
                  </span>
                </div>
                <div className="card-link">
                  View client details <Icon name="arrow" size={16} />
                </div>
              </button>
            )
          })}
        </section>
      )}
    </>
  )
}

// ─── Client Details Component ───────────────────────────────────────────────

function ClientDetails({
  id,
  clients,
  payments,
  expenses,
  deliverables,
  back,
  openModal,
  onDeleteClient,
  onDeletePayment,
  onDeleteExpense,
  onDeleteDeliverable,
  onUpdateDeliverableStatus,
  currency,
}: {
  id: string
  clients: ClientRecord[]
  payments: ClientPaymentRecord[]
  expenses: ExpenseRecord[]
  deliverables: DeliverableRecord[]
  back: () => void
  openModal: (type: string, targetId?: string, initialData?: any) => void
  onDeleteClient: (id: string, name: string) => Promise<void>
  onDeletePayment: (id: string) => Promise<void>
  onDeleteExpense: (id: string) => Promise<void>
  onDeleteDeliverable: (id: string) => Promise<void>
  onUpdateDeliverableStatus: (
    id: string,
    status: "Pending" | "In Progress" | "Completed",
  ) => Promise<void>
  currency: string
}) {
  const client = clients.find((c) => c.id === id)

  if (!client) {
    return (
      <>
        <button className="back-link" onClick={back}>
          ‹ Back to clients
        </button>
        <div className="empty-box panel">
          <p>Client record not found in Supabase.</p>
        </div>
      </>
    )
  }

  const clientPayments = payments.filter((p) => p.client_id === client.id)
  const totalReceived = clientPayments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0,
  )
  const outstanding = Math.max(0, client.amount - totalReceived)

  const clientExpenses = expenses.filter(
    (e) =>
      e.client_id === client.id ||
      (e.client_name && e.client_name === client.business),
  )
  const totalClientExpenses = clientExpenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0,
  )
  const projectProfit = totalReceived - totalClientExpenses

  const clientDeliverables = deliverables.filter(
    (d) => d.client_id === client.id,
  )
  const completedVideos = clientDeliverables.filter(
    (d) => d.type === "Video" && d.status === "Completed",
  ).length
  const completedPosters = clientDeliverables.filter(
    (d) => d.type === "Poster" && d.status === "Completed",
  ).length

  const paymentPct =
    client.amount > 0
      ? Math.min(100, Math.round((totalReceived / client.amount) * 100))
      : 0

  return (
    <>
      <button className="back-link" onClick={back}>
        ‹ Back to clients
      </button>
      <PageHeader
        eyebrow="Client profile"
        title={client.business}
        description={`${client.name} · ${client.phone}`}
        action={
          <div className="button-row">
            <Button
              variant="outline"
              icon="edit"
              onClick={() => openModal("client", client.id, client)}
            >
              Edit client
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => onDeleteClient(client.id, client.business)}
            >
              Delete
            </Button>
          </div>
        }
      />

      <section className="detail-summary">
        {[
          ["Package amount", formatMoney(client.amount, currency)],
          ["Total received", formatMoney(totalReceived, currency)],
          ["Outstanding", formatMoney(outstanding, currency)],
          ["Est. project profit", formatMoney(projectProfit, currency)],
        ].map(([a, b], i) => (
          <div className={i === 3 ? "accent" : ""} key={a}>
            <span>{a}</span>
            <strong>{b}</strong>
          </div>
        ))}
      </section>

      <div className="two-column">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Package</h2>
              <p>Current monthly agreement</p>
            </div>
            <Status>{client.status}</Status>
          </div>
          <div className="info-list">
            <span>
              <small>Monthly amount</small>
              <strong>{formatMoney(client.amount, currency)}</strong>
            </span>
            <span>
              <small>Included videos</small>
              <strong>{client.videos} / month</strong>
            </span>
            <span>
              <small>Included posters</small>
              <strong>{client.posters} / month</strong>
            </span>
            <span>
              <small>Package period</small>
              <strong>
                {formatDateDisplay(client.start_date)} —{" "}
                {formatDateDisplay(client.end_date)}
              </strong>
            </span>
            {client.notes ? (
              <span style={{ gridColumn: "1 / -1" }}>
                <small>Notes / Project details</small>
                <strong style={{ fontWeight: 400, color: "var(--text-secondary)" }}>
                  {client.notes}
                </strong>
              </span>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Payment tracker</h2>
              <p>{formatMoney(outstanding, currency)} balance remaining</p>
            </div>
            <Button
              variant="light"
              icon="plus"
              onClick={() => openModal("payment", client.id)}
            >
              Add payment
            </Button>
          </div>
          <div className="progress-track">
            <span style={{ width: `${paymentPct}%` }} />
          </div>
          {clientPayments.length === 0 ? (
            <div className="empty-box" style={{ padding: "20px 0" }}>
              <p>No payments recorded yet for this client in Supabase.</p>
            </div>
          ) : (
            <div className="mini-table">
              {clientPayments.map((p) => (
                <div key={p.id}>
                  <span>{formatDateDisplay(p.payment_date)}</span>
                  <span>
                    {p.payment_method} · {p.reference || "No ref"}
                  </span>
                  <strong>{formatMoney(p.amount, currency)}</strong>
                  <button
                    className="action-btn danger"
                    title="Delete payment"
                    onClick={() => onDeletePayment(p.id)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Work progress</h2>
            <p>Monthly deliverables</p>
          </div>
          <div className="button-row">
            <Button
              variant="outline"
              icon="plus"
              onClick={() => openModal("video", client.id)}
            >
              Add video
            </Button>
            <Button
              variant="light"
              icon="plus"
              onClick={() => openModal("poster", client.id)}
            >
              Add poster
            </Button>
          </div>
        </div>
        <div className="work-overview">
          <div>
            <span>Videos completed</span>
            <strong>
              {completedVideos} / {client.videos}
            </strong>
            <div className="progress-track">
              <span
                style={{
                  width: `${
                    client.videos > 0
                      ? Math.min(100, (completedVideos / client.videos) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
          <div>
            <span>Posters completed</span>
            <strong>
              {completedPosters} / {client.posters}
            </strong>
            <div className="progress-track">
              <span
                style={{
                  width: `${
                    client.posters > 0
                      ? Math.min(100, (completedPosters / client.posters) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </div>

        {clientDeliverables.length === 0 ? (
          <div className="empty-box" style={{ padding: "25px 0" }}>
            <p>No deliverables added yet for this client.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Work title</th>
                  <th>Type</th>
                  <th>Assigned staff</th>
                  <th>Status</th>
                  <th>Completion</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {clientDeliverables.map((del) => (
                  <tr key={del.id}>
                    <td>{del.title}</td>
                    <td>{del.type}</td>
                    <td>{del.assigned_staff || "—"}</td>
                    <td>
                      <select
                        value={del.status}
                        onChange={(e) =>
                          onUpdateDeliverableStatus(
                            del.id,
                            e.target.value as any,
                          )
                        }
                        style={{
                          fontSize: 11,
                          padding: "3px 6px",
                          borderRadius: 6,
                          border: "1px solid var(--line)",
                          background: "var(--white)",
                        }}
                      >
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </td>
                    <td>
                      {del.completion_date
                        ? formatDateDisplay(del.completion_date)
                        : "—"}
                    </td>
                    <td>
                      <button
                        className="action-btn danger"
                        title="Delete deliverable"
                        onClick={() => onDeleteDeliverable(del.id)}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Client expenses</h2>
            <p>
              Total project expenses: {formatMoney(totalClientExpenses, currency)}
            </p>
          </div>
          <Button
            variant="light"
            icon="plus"
            onClick={() => openModal("expense", client.id)}
          >
            Add expense
          </Button>
        </div>
        {clientExpenses.length === 0 ? (
          <div className="empty-box" style={{ padding: "25px 0" }}>
            <p>No project expenses recorded for this client.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Payment status</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {clientExpenses.map((exp) => (
                  <tr key={exp.id}>
                    <td>{formatDateDisplay(exp.date)}</td>
                    <td>{exp.category}</td>
                    <td>{exp.description}</td>
                    <td>
                      <Status>{exp.status}</Status>
                    </td>
                    <td>
                      <b>{formatMoney(exp.amount, currency)}</b>
                    </td>
                    <td>
                      <button
                        className="action-btn danger"
                        title="Delete expense"
                        onClick={() => onDeleteExpense(exp.id)}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

// ─── Expenses Page Component ────────────────────────────────────────────────

function Expenses({
  expenses,
  selectedMonth,
  onMonthChange,
  openModal,
  onDeleteExpense,
  currency,
}: {
  expenses: ExpenseRecord[]
  selectedMonth: string
  onMonthChange: (monthKey: string) => void
  openModal: (type: string, targetId?: string, initialData?: any) => void
  onDeleteExpense: (id: string) => Promise<void>
  currency: string
}) {
  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("All categories")

  const monthExpenses = expenses.filter((e) =>
    dateIsInMonth(e.date, selectedMonth),
  )

  const filtered = monthExpenses.filter((e) => {
    const matchesQ =
      `${e.category} ${e.description} ${e.recipient} ${e.client_name || ""}`
        .toLowerCase()
        .includes(query.toLowerCase())
    const matchesC =
      categoryFilter === "All categories" || e.category === categoryFilter
    return matchesQ && matchesC
  })

  const totalThisMonth = monthExpenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0,
  )
  const paidExpenses = monthExpenses
    .filter((e) => e.status === "Paid")
    .reduce((sum, e) => sum + Number(e.amount || 0), 0)
  const pendingExpenses = monthExpenses
    .filter((e) => e.status === "Pending")
    .reduce((sum, e) => sum + Number(e.amount || 0), 0)

  return (
    <>
      <PageHeader
        eyebrow="Financial ledger"
        title="Expenses"
        description="Track every operating and project expense without duplication."
        action={
          <Button icon="plus" onClick={() => openModal("expense")}>
            Add expense
          </Button>
        }
      />

      <section className="summary-strip">
        <div>
          <span>Total this month</span>
          <strong>{formatMoney(totalThisMonth, currency)}</strong>
        </div>
        <div>
          <span>Paid expenses</span>
          <strong>{formatMoney(paidExpenses, currency)}</strong>
        </div>
        <div>
          <span>Pending expenses</span>
          <strong>{formatMoney(pendingExpenses, currency)}</strong>
        </div>
      </section>

      <div className="toolbar">
        <Search
          value={query}
          onChange={setQuery}
          placeholder="Search expense history"
        />
        <div className="button-row">
          <label className="compact-select">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option>All categories</option>
              <option>Staff Salary</option>
              <option>Editor</option>
              <option>Cameraman</option>
              <option>Travel</option>
              <option>Rent</option>
              <option>Software</option>
              <option>Equipment</option>
              <option>Marketing</option>
              <option>Other</option>
            </select>
          </label>
          <MonthNavigator
            selectedMonth={selectedMonth}
            onChange={onMonthChange}
          />
        </div>
      </div>

      <section className="panel table-panel">
        {filtered.length === 0 ? (
          <div className="empty-box">
            <Icon name="expenses" size={30} />
            <strong>No expenses recorded for this month</strong>
            <p>Click "Add expense" above to record a new business expense in Supabase.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category & description</th>
                  <th>Recipient / vendor</th>
                  <th>Related client</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDateDisplay(e.date)}</td>
                    <td>
                      <b>{e.category}</b>
                      <small>{e.description}</small>
                      {e.notes ? (
                        <small style={{ color: "var(--accent-gold)", display: "block" }}>
                          Note: {e.notes}
                        </small>
                      ) : null}
                    </td>
                    <td>{e.recipient}</td>
                    <td>{e.client_name || "—"}</td>
                    <td>
                      <Status>{e.status}</Status>
                    </td>
                    <td>
                      <b>{formatMoney(e.amount, currency)}</b>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="action-btn"
                          title="Edit expense"
                          onClick={() => openModal("expense", undefined, e)}
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          className="action-btn danger"
                          title="Delete expense"
                          onClick={() => onDeleteExpense(e.id)}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

// ─── Staff Page Component ───────────────────────────────────────────────────

function Staff({
  staff,
  staffPayments,
  expenses,
  selectedMonth,
  onMonthChange,
  openStaff,
  openModal,
  onDeleteExpense,
  onDeleteStaffPayment,
  currency,
}: {
  staff: StaffRecord[]
  staffPayments: StaffPaymentRecord[]
  expenses: ExpenseRecord[]
  selectedMonth: string
  onMonthChange: (monthKey: string) => void
  openStaff: (id: string) => void
  openModal: (type: string, staffId?: string, initialData?: any) => void
  onDeleteExpense: (id: string) => Promise<void>
  onDeleteStaffPayment: (id: string) => Promise<void>
  currency: string
}) {
  const currentMonthInfo = getMonthByKey(selectedMonth)

  // Combined salary expense records for the selected month
  const monthSalaryRecords = useMemo(() => {
    const list: {
      id: string
      date: string
      staffId?: string
      staffName: string
      role?: string
      description: string
      clientName?: string
      paymentMethod: string
      reference: string
      status: "Paid" | "Pending"
      notes?: string
      amount: number
      isExpense: boolean
      rawExpense?: ExpenseRecord
      onDelete: () => Promise<void>
    }[] = []

    // Expenses with category "Staff Salary" or linked to staff
    expenses
      .filter((e) => isStaffSalaryExpense(e) && dateIsInMonth(e.date, selectedMonth))
      .forEach((e) => {
        const matched = staff.find((s) => expenseMatchesStaff(e, s))
        list.push({
          id: e.id,
          date: e.date,
          staffId: matched?.id || e.staff_id || undefined,
          staffName: matched?.name || e.recipient || "Staff (Unassigned)",
          role: matched?.role,
          description: e.description || `${e.category} expense`,
          clientName: e.client_name,
          paymentMethod: e.payment_method || "Bank transfer",
          reference: e.receipt_reference || "",
          status: e.status,
          notes: e.notes,
          amount: Number(e.amount || 0),
          isExpense: true,
          rawExpense: e,
          onDelete: () => onDeleteExpense(e.id),
        })
      })

    // Legacy staff payments not duplicated in expenses
    staffPayments
      .filter(
        (sp) =>
          dateIsInMonth(sp.payment_date, selectedMonth) &&
          !expenses.some((e) => e.id === sp.id),
      )
      .forEach((sp) => {
        const matched = staff.find((s) => s.id === sp.staff_id)
        list.push({
          id: sp.id,
          date: sp.payment_date,
          staffId: sp.staff_id,
          staffName: matched?.name || sp.staff_name || "Staff",
          role: matched?.role,
          description: sp.work_description || `${sp.payment_type} payment`,
          clientName: sp.related_client,
          paymentMethod: sp.payment_method || "Bank transfer",
          reference: sp.reference || "",
          status: sp.status,
          notes: "",
          amount: Number(sp.amount || 0),
          isExpense: false,
          onDelete: () => onDeleteStaffPayment(sp.id),
        })
      })

    return list.sort((a, b) => b.date.localeCompare(a.date))
  }, [expenses, staffPayments, staff, selectedMonth, onDeleteExpense, onDeleteStaffPayment])

  return (
    <>
      <PageHeader
        eyebrow="Team management"
        title="Staff"
        description="Manage team profiles, roles and salary expense records."
        action={
          <div className="button-row">
            <Button
              variant="outline"
              icon="plus"
              onClick={() =>
                openModal("expense", undefined, {
                  category: "Staff Salary",
                  description: "Monthly staff salary",
                })
              }
            >
              Record salary expense
            </Button>
            <Button icon="plus" onClick={() => openModal("staff")}>
              Add staff
            </Button>
          </div>
        }
      />

      {staff.length === 0 ? (
        <div className="empty-box panel">
          <Icon name="staff" size={32} />
          <strong>No staff members added yet</strong>
          <p>Click "Add staff" above to create your team in Supabase.</p>
        </div>
      ) : (
        <section className="staff-grid">
          {staff.map((person) => {
            const initials =
              person.name
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")
                .toUpperCase() || "ST"

            const pSalaryExpenses = expenses.filter(
              (e) =>
                isStaffSalaryExpense(e) &&
                expenseMatchesStaff(e, person) &&
                dateIsInMonth(e.date, selectedMonth),
            )
            const pLegacyPayments = staffPayments.filter(
              (sp) =>
                sp.staff_id === person.id &&
                dateIsInMonth(sp.payment_date, selectedMonth) &&
                !expenses.some((e) => e.id === sp.id),
            )

            const paidMonth =
              pSalaryExpenses
                .filter((e) => e.status === "Paid")
                .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
              pLegacyPayments
                .filter((sp) => sp.status === "Paid")
                .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

            const pendingMonth =
              pSalaryExpenses
                .filter((e) => e.status === "Pending")
                .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
              pLegacyPayments
                .filter((sp) => sp.status === "Pending")
                .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

            return (
              <button
                className="staff-card"
                key={person.id}
                onClick={() => openStaff(person.id)}
              >
                <div className="staff-main">
                  <span className="avatar large">{initials}</span>
                  <div>
                    <h2>{person.name}</h2>
                    <p>
                      {person.role} · {person.phone}
                    </p>
                  </div>
                  <Status>{person.status}</Status>
                </div>
                <div className="payment-split">
                  <span>
                    Paid this month
                    <strong>{formatMoney(paidMonth, currency)}</strong>
                  </span>
                  <span>
                    Pending
                    <strong>{formatMoney(pendingMonth, currency)}</strong>
                  </span>
                </div>
                <div className="staff-footer">
                  <span>
                    {person.salary > 0
                      ? `${formatMoney(person.salary, currency)} monthly salary`
                      : "Project-based payments"}
                  </span>
                  <Icon name="arrow" size={16} />
                </div>
              </button>
            )
          })}
        </section>
      )}

      {/* Staff Salary & Expense Records Ledger */}
      <section className="panel" style={{ marginTop: "24px" }}>
        <div className="panel-heading">
          <div>
            <h2>Staff Salary & Expense Records</h2>
            <p>
              Salary and compensation expenses recorded in the financial ledger for{" "}
              {currentMonthInfo.label}.
            </p>
          </div>
          <div className="button-row">
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={onMonthChange}
            />
          </div>
        </div>

        {monthSalaryRecords.length === 0 ? (
          <div className="empty-box">
            <Icon name="staff" size={28} />
            <strong>No staff salary expenses recorded for this month</strong>
            <p>
              Click "Record salary expense" above or add an expense under category
              "Staff Salary" to track compensation in Supabase.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Staff member</th>
                  <th>Description</th>
                  <th>Payment method & ref</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {monthSalaryRecords.map((rec) => (
                  <tr key={rec.id}>
                    <td>{formatDateDisplay(rec.date)}</td>
                    <td>
                      <b>{rec.staffName}</b>
                      {rec.role && (
                        <small style={{ display: "block", color: "var(--text-muted)" }}>
                          {rec.role}
                        </small>
                      )}
                    </td>
                    <td>
                      <span>{rec.description}</span>
                      {rec.clientName && rec.clientName !== "—" && (
                        <small style={{ display: "block", color: "var(--text-muted)" }}>
                          Project: {rec.clientName}
                        </small>
                      )}
                    </td>
                    <td>
                      {rec.paymentMethod}
                      {rec.reference ? ` · ${rec.reference}` : ""}
                    </td>
                    <td>
                      <Status>{rec.status}</Status>
                    </td>
                    <td>
                      {rec.notes ? (
                        <span style={{ fontSize: "13px", color: "var(--accent-gold)" }}>
                          {rec.notes}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <b>{formatMoney(rec.amount, currency)}</b>
                    </td>
                    <td>
                      <div className="row-actions">
                        {rec.isExpense && (
                          <button
                            className="action-btn"
                            title="Edit salary expense"
                            onClick={() =>
                              openModal("expense", rec.staffId, rec.rawExpense)
                            }
                          >
                            <Icon name="edit" size={14} />
                          </button>
                        )}
                        <button
                          className="action-btn danger"
                          title="Delete salary record"
                          onClick={() => rec.onDelete()}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

// ─── Staff Details Component ────────────────────────────────────────────────

function StaffDetails({
  id,
  staff,
  staffPayments,
  expenses,
  selectedMonth,
  back,
  openModal,
  onDeleteStaff,
  onDeleteStaffPayment,
  onDeleteExpense,
  currency,
}: {
  id: string
  staff: StaffRecord[]
  staffPayments: StaffPaymentRecord[]
  expenses: ExpenseRecord[]
  selectedMonth: string
  back: () => void
  openModal: (type: string, staffId?: string, initialData?: any) => void
  onDeleteStaff: (id: string, name: string) => Promise<void>
  onDeleteStaffPayment: (id: string) => Promise<void>
  onDeleteExpense: (id: string) => Promise<void>
  currency: string
}) {
  const person = staff.find((s) => s.id === id)

  if (!person) {
    return (
      <>
        <button className="back-link" onClick={back}>
          ‹ Back to staff
        </button>
        <div className="empty-box panel">
          <p>Staff member not found in Supabase.</p>
        </div>
      </>
    )
  }

  // Unified salary and payment history for this person
  const personRecords = useMemo(() => {
    const list: {
      id: string
      date: string
      type: string
      relatedClient: string
      description: string
      paymentMethod: string
      reference: string
      status: "Paid" | "Pending"
      notes?: string
      amount: number
      isExpense: boolean
      rawExpense?: ExpenseRecord
      onDelete: () => Promise<void>
    }[] = []

    // Expenses matching this staff member
    expenses
      .filter((e) => isStaffSalaryExpense(e) && expenseMatchesStaff(e, person))
      .forEach((e) => {
        list.push({
          id: e.id,
          date: e.date,
          type: e.category,
          relatedClient: e.client_name || "Company operations",
          description: e.description || `${e.category} expense`,
          paymentMethod: e.payment_method || "Bank transfer",
          reference: e.receipt_reference || "",
          status: e.status,
          notes: e.notes,
          amount: Number(e.amount || 0),
          isExpense: true,
          rawExpense: e,
          onDelete: () => onDeleteExpense(e.id),
        })
      })

    // Legacy staff payments
    staffPayments
      .filter(
        (sp) => sp.staff_id === person.id && !expenses.some((e) => e.id === sp.id),
      )
      .forEach((sp) => {
        list.push({
          id: sp.id,
          date: sp.payment_date,
          type: sp.payment_type,
          relatedClient: sp.related_client || "Company operations",
          description: sp.work_description || `${sp.payment_type} payment`,
          paymentMethod: sp.payment_method || "Bank transfer",
          reference: sp.reference || "",
          status: sp.status,
          notes: "",
          amount: Number(sp.amount || 0),
          isExpense: false,
          onDelete: () => onDeleteStaffPayment(sp.id),
        })
      })

    return list.sort((a, b) => b.date.localeCompare(a.date))
  }, [expenses, staffPayments, person, onDeleteExpense, onDeleteStaffPayment])

  const paidThisMonth = personRecords
    .filter((r) => dateIsInMonth(r.date, selectedMonth) && r.status === "Paid")
    .reduce((sum, r) => sum + r.amount, 0)

  const totalPending = personRecords
    .filter((r) => r.status === "Pending")
    .reduce((sum, r) => sum + r.amount, 0)

  return (
    <>
      <button className="back-link" onClick={back}>
        ‹ Back to staff
      </button>
      <PageHeader
        eyebrow="Staff profile"
        title={person.name}
        description={`${person.role} · ${person.phone}`}
        action={
          <div className="button-row">
            <Button
              variant="outline"
              icon="edit"
              onClick={() => openModal("staff", person.id, person)}
            >
              Edit profile
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => onDeleteStaff(person.id, person.name)}
            >
              Delete
            </Button>
            <Button
              icon="plus"
              onClick={() =>
                openModal("expense", person.id, {
                  category: "Staff Salary",
                  recipient: person.name,
                  staff_id: person.id,
                  amount: person.salary > 0 ? person.salary : undefined,
                  description: `${person.name} — Monthly salary`,
                })
              }
            >
              Record salary / payment
            </Button>
          </div>
        }
      />

      <section className="detail-summary three">
        <div>
          <span>Paid this month</span>
          <strong>{formatMoney(paidThisMonth, currency)}</strong>
        </div>
        <div>
          <span>Total pending</span>
          <strong>{formatMoney(totalPending, currency)}</strong>
        </div>
        <div className="accent">
          <span>Payment structure</span>
          <strong>
            {person.salary > 0
              ? `${formatMoney(person.salary, currency)} / month`
              : "Project based"}
          </strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Payment & Salary history</h2>
            <p>Compensation records for this staff member in Supabase.</p>
          </div>
        </div>

        {personRecords.length === 0 ? (
          <div className="empty-box">
            <p>No payment or salary records for this staff member yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Payment date</th>
                  <th>Type</th>
                  <th>Related client / project</th>
                  <th>Description</th>
                  <th>Method & reference</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {personRecords.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateDisplay(r.date)}</td>
                    <td>{r.type}</td>
                    <td>{r.relatedClient}</td>
                    <td>{r.description || "—"}</td>
                    <td>
                      {r.paymentMethod} · {r.reference || "No ref"}
                    </td>
                    <td>
                      <Status>{r.status}</Status>
                    </td>
                    <td>
                      {r.notes ? (
                        <span style={{ fontSize: "13px", color: "var(--accent-gold)" }}>
                          {r.notes}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <b>{formatMoney(r.amount, currency)}</b>
                    </td>
                    <td>
                      <div className="row-actions">
                        {r.isExpense && (
                          <button
                            className="action-btn"
                            title="Edit salary expense"
                            onClick={() =>
                              openModal("expense", person.id, r.rawExpense)
                            }
                          >
                            <Icon name="edit" size={14} />
                          </button>
                        )}
                        <button
                          className="action-btn danger"
                          title="Delete payment record"
                          onClick={() => r.onDelete()}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

// ─── Monthly Reports Component ──────────────────────────────────────────────

function Reports({
  selectedMonth,
  onMonthChange,
  clients,
  payments,
  expenses,
  staff,
  staffPayments,
  currency,
  settings,
}: {
  selectedMonth: string
  onMonthChange: (monthKey: string) => void
  clients: ClientRecord[]
  payments: ClientPaymentRecord[]
  expenses: ExpenseRecord[]
  staff: StaffRecord[]
  staffPayments: StaffPaymentRecord[]
  currency: string
  settings?: CompanySettings
}) {
  const [reportType, setReportType] = useState<ReportType>("comprehensive")
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  const monthInfo = getMonthByKey(selectedMonth)

  const activeClients = clients.filter(
    (c) =>
      c.status !== "Inactive" &&
      c.start_date <= monthInfo.endDate &&
      c.end_date >= monthInfo.startDate,
  )
  const totalRevenue = activeClients.reduce(
    (sum, c) => sum + Number(c.amount || 0),
    0,
  )

  const monthPayments = payments.filter((p) =>
    dateIsInMonth(p.payment_date, selectedMonth),
  )
  const cashReceived = monthPayments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0,
  )

  const outstanding = Math.max(0, totalRevenue - cashReceived)

  const monthExpenses = expenses.filter((e) =>
    dateIsInMonth(e.date, selectedMonth),
  )

  const legacyMonthStaffPayments = staffPayments.filter(
    (sp) =>
      dateIsInMonth(sp.payment_date, selectedMonth) &&
      !expenses.some(
        (e) =>
          e.id === sp.id ||
          (e.date === sp.payment_date &&
            Number(e.amount) === Number(sp.amount) &&
            isStaffSalaryExpense(e)),
      ),
  )
  const legacyStaffTotal = legacyMonthStaffPayments.reduce(
    (sum, sp) => sum + Number(sp.amount || 0),
    0,
  )

  const totalExpenses =
    monthExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0) +
    legacyStaffTotal

  // Net Income = Total Income − Total Expenses
  const netIncome = cashReceived - totalExpenses

  const staffSalaryExpenses = monthExpenses.filter((e) => isStaffSalaryExpense(e))
  const staffPaid =
    staffSalaryExpenses
      .filter((e) => e.status === "Paid")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
    legacyMonthStaffPayments
      .filter((sp) => sp.status === "Paid")
      .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

  const staffPending =
    staffSalaryExpenses
      .filter((e) => e.status === "Pending")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
    legacyMonthStaffPayments
      .filter((sp) => sp.status === "Pending")
      .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

  const expenseCategories = useMemo(() => {
    const cats: Record<string, number> = {}
    monthExpenses.forEach((e) => {
      cats[e.category] = (cats[e.category] || 0) + Number(e.amount || 0)
    })
    if (legacyStaffTotal > 0) {
      cats["Staff Salary (Legacy)"] = (cats["Staff Salary (Legacy)"] || 0) + legacyStaffTotal
    }
    return cats
  }, [monthExpenses, legacyStaffTotal])

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true)
    try {
      await downloadPdfReport({
        monthInfo,
        clients,
        payments,
        expenses,
        staff,
        staffPayments,
        settings,
        currency,
        reportType,
      })
    } catch (err) {
      console.error("[Filmdappa CRM] PDF generation error:", err)
      alert("Failed to generate PDF. Please try again.")
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const handlePrintPreview = () => {
    openPrintableReport({
      monthInfo,
      clients,
      payments,
      expenses,
      staff,
      staffPayments,
      settings,
      currency,
      reportType,
    })
  }

  return (
    <>
      <PageHeader
        eyebrow="Financial reporting"
        title="Month-end report"
        description={`${monthInfo.label} · Revenue, cash and net income derived from actual Supabase records.`}
        action={
          <div className="button-row" style={{ flexWrap: "wrap" }}>
            <MonthNavigator
              selectedMonth={selectedMonth}
              onChange={onMonthChange}
            />
            <Button
              variant="outline"
              icon="calendar"
              onClick={handlePrintPreview}
              title="Open print preview / browser Save as PDF"
            >
              Print / Preview
            </Button>
            <Button
              icon="download"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              title="Generate and download official PDF report with logo & watermark"
            >
              {isGeneratingPdf ? "Generating PDF..." : "Download PDF Report"}
            </Button>
          </div>
        }
      />

      <div className="report-filter">
        <div>
          <span>Reporting period</span>
          <strong>{monthInfo.label}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>
            Report Scope:
          </span>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid var(--black)",
              background: "#ffffff",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <option value="comprehensive">Comprehensive Statement</option>
            <option value="clients">Client Collections & Revenue</option>
            <option value="staff">Staff Salary & Compensation</option>
            <option value="expenses">Operating Expenses Ledger</option>
          </select>
        </div>
        <span>
          Prepared from ledger records as of {formatDateDisplay(monthInfo.endDate)}
        </span>
      </div>

      <section className="summary-grid report">
        {[
          ["Total revenue", formatMoney(totalRevenue, currency)],
          ["Cash received", formatMoney(cashReceived, currency)],
          ["Outstanding payments", formatMoney(outstanding, currency)],
          ["Total expenses", formatMoney(totalExpenses, currency)],
          [
            "Staff paid / pending",
            `${formatMoney(staffPaid, currency)} / ${formatMoney(staffPending, currency)}`,
          ],
          ["Net income", formatMoney(netIncome, currency)],
        ].map(([a, b], i) => (
          <article
            className={i === 5 ? "summary-card highlight" : "summary-card"}
            key={a}
          >
            <span>{a}</span>
            <strong>{b}</strong>
          </article>
        ))}
      </section>

      <div className="two-column report-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Client-wise summary</h2>
              <p>Income received and direct expenses</p>
            </div>
          </div>
          {activeClients.length === 0 ? (
            <div className="empty-box">
              <p>No active clients for this period in Supabase.</p>
            </div>
          ) : (
            <div className="report-list">
              {activeClients.map((c) => {
                const cRec = monthPayments
                  .filter((p) => p.client_id === c.id)
                  .reduce((sum, p) => sum + Number(p.amount || 0), 0)
                const cExp = monthExpenses
                  .filter(
                    (e) =>
                      e.client_id === c.id ||
                      (e.client_name && e.client_name === c.business),
                  )
                  .reduce((sum, e) => sum + Number(e.amount || 0), 0)

                return (
                  <div key={c.id}>
                    <span>
                      <strong>{c.business}</strong>
                      <small>Expenses {formatMoney(cExp, currency)}</small>
                    </span>
                    <b>{formatMoney(cRec, currency)}</b>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Staff payment summary</h2>
              <p>Paid and pending this month</p>
            </div>
          </div>
          {staff.length === 0 ? (
            <div className="empty-box">
              <p>No staff records available in Supabase.</p>
            </div>
          ) : (
            <div className="report-list">
              {staff.map((s) => {
                const sSalaryExpenses = monthExpenses.filter(
                  (e) => isStaffSalaryExpense(e) && expenseMatchesStaff(e, s),
                )
                const sLegacyPayments = legacyMonthStaffPayments.filter(
                  (sp) => sp.staff_id === s.id,
                )
                const sPaid =
                  sSalaryExpenses
                    .filter((e) => e.status === "Paid")
                    .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
                  sLegacyPayments
                    .filter((sp) => sp.status === "Paid")
                    .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)
                const sPending =
                  sSalaryExpenses
                    .filter((e) => e.status === "Pending")
                    .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
                  sLegacyPayments
                    .filter((sp) => sp.status === "Pending")
                    .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

                return (
                  <div key={s.id}>
                    <span>
                      <strong>{s.name}</strong>
                      <small>
                        {s.role} · Pending {formatMoney(sPending, currency)}
                      </small>
                    </span>
                    <b>{formatMoney(sPaid, currency)}</b>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Monthly income and expense breakdown</h2>
            <p>Cash movement by category</p>
          </div>
        </div>
        <div className="breakdown">
          <div>
            <h3>Income</h3>
            <span>
              Client payments<b>{formatMoney(cashReceived, currency)}</b>
            </span>
            <span className="total">
              Total cash received<b>{formatMoney(cashReceived, currency)}</b>
            </span>
          </div>
          <div>
            <h3>Expenses</h3>
            {Object.keys(expenseCategories).length === 0 ? (
              <span>
                No expenses recorded<b>{formatMoney(0, currency)}</b>
              </span>
            ) : (
              Object.entries(expenseCategories).map(([cat, amt]) => (
                <span key={cat}>
                  {cat}
                  <b>{formatMoney(amt, currency)}</b>
                </span>
              ))
            )}
            <span className="total">
              Total expenses
              <b>{formatMoney(totalExpenses, currency)}</b>
            </span>
          </div>
        </div>
      </section>
    </>
  )
}

// ─── Audit Logs Component ───────────────────────────────────────────────────

function AuditLogs({ logs }: { logs: AuditRecord[] }) {
  const [query, setQuery] = useState("")

  const filtered = logs.filter(
    (l) =>
      l.record_type.toLowerCase().includes(query.toLowerCase()) ||
      l.description.toLowerCase().includes(query.toLowerCase()) ||
      l.actor.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Audit logs"
        description="A read-only trail of financial records and security events in Supabase."
      />
      <div className="notice">
        <Icon name="audit" />
        <span>
          <strong>Authorized access only</strong> Financial records can only be
          managed by authorized team members.
        </span>
      </div>
      <div className="toolbar">
        <Search
          value={query}
          onChange={setQuery}
          placeholder="Search audit logs"
        />
      </div>
      <section className="panel table-panel">
        {filtered.length === 0 ? (
          <div className="empty-box">
            <Icon name="audit" size={30} />
            <strong>No audit events recorded yet</strong>
            <p>Security and financial actions will appear here automatically.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Record type</th>
                  <th>Amount</th>
                  <th>Actor</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString("en-IN")}</td>
                    <td>{row.record_type}</td>
                    <td>
                      <b>{row.amount || "—"}</b>
                    </td>
                    <td>{row.actor}</td>
                    <td>{row.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

// ─── Settings Component ─────────────────────────────────────────────────────

function Settings({
  settings,
  onSave,
}: {
  settings: CompanySettings
  onSave: (s: CompanySettings) => Promise<void>
}) {
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState("")

  useEffect(() => {
    setForm(settings)
  }, [settings])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg("")
    try {
      await onSave(form)
      setMsg("Company profile saved to Supabase successfully.")
      setTimeout(() => setMsg(""), 3500)
    } catch (err: unknown) {
      setMsg(
        err instanceof Error ? err.message : "Failed to save company profile.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage company details and workspace profile."
      />
      <div style={{ maxWidth: 640 }}>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Company profile</h2>
              <p>Used on internal reports and exports</p>
            </div>
          </div>
          <form className="form-grid" onSubmit={handleSubmit}>
            <Field
              label="Company name"
              value={form.company_name}
              onChange={(val) => setForm({ ...form, company_name: val })}
              required
            />
            <Field
              label="Business email"
              type="email"
              value={form.business_email}
              onChange={(val) => setForm({ ...form, business_email: val })}
              required
            />
            <Field
              label="Phone number"
              value={form.phone_number}
              onChange={(val) => setForm({ ...form, phone_number: val })}
            />
            <SelectField
              label="Currency"
              value={form.currency}
              options={[
                "INR — Indian Rupee",
                "USD — US Dollar",
                "EUR — Euro",
                "GBP — British Pound",
              ]}
              onChange={(val) => setForm({ ...form, currency: val })}
            />
            <div className="form-actions">
              {msg && (
                <span
                  style={{
                    marginRight: "auto",
                    alignSelf: "center",
                    fontSize: 12,
                    color: msg.includes("Failed") ? "#dc2626" : "#15803d",
                  }}
                >
                  {msg}
                </span>
              )}
              <Button type="submit" disabled={saving}>
                {saving ? "Saving to Supabase..." : "Save changes"}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </>
  )
}

// ─── Modal Data Entry Form (Supports Create & Update) ─────────────────────────

function Modal({
  type,
  targetId,
  initialData,
  selectedMonth,
  clients,
  staff,
  close,
  onRecordSaved,
}: {
  type: string
  targetId?: string
  initialData?: any
  selectedMonth: string
  clients: ClientRecord[]
  staff: StaffRecord[]
  close: () => void
  onRecordSaved: (msg: string, record?: any) => void
}) {
  const currentMonthInfo = getMonthByKey(selectedMonth)
  const defaultDate = `${selectedMonth}-01`

  // Client form state
  const [cName, setCName] = useState(initialData?.name || "")
  const [cBusiness, setCBusiness] = useState(initialData?.business || "")
  const [cPhone, setCPhone] = useState(initialData?.phone || "+91 ")
  const [cAmount, setCAmount] = useState(
    initialData?.amount !== undefined ? String(initialData.amount) : "",
  )
  const [cVideos, setCVideos] = useState(
    initialData?.videos !== undefined ? String(initialData.videos) : "",
  )
  const [cPosters, setCPosters] = useState(
    initialData?.posters !== undefined ? String(initialData.posters) : "",
  )
  const [cStart, setCStart] = useState(initialData?.start_date || defaultDate)
  const [cEnd, setCEnd] = useState(initialData?.end_date || currentMonthInfo.endDate)
  const [cStatus, setCStatus] = useState<"Active" | "Ending soon" | "Inactive">(
    initialData?.status || "Active",
  )
  const [cNotes, setCNotes] = useState(initialData?.notes || "")

  // Check if targetId is a staff member or client
  const targetStaff = staff.find((s) => s.id === targetId)
  const targetClient = clients.find((c) => c.id === targetId)

  // Expense form state
  const [eDate, setEDate] = useState(initialData?.date || defaultDate)
  const [eCategory, setECategory] = useState(initialData?.category || "Staff Salary")
  const [eDesc, setEDesc] = useState(initialData?.description || "")
  const [eAmount, setEAmount] = useState(
    initialData?.amount !== undefined ? String(initialData.amount) : "",
  )
  const [eRecipient, setERecipient] = useState(
    initialData?.recipient || targetStaff?.name || "",
  )
  const [eStaffId, setEStaffId] = useState(
    initialData?.staff_id || targetStaff?.id || "",
  )
  const [eClientId, setEClientId] = useState(
    initialData?.client_id || targetClient?.id || "",
  )
  const [eStatus, setEStatus] = useState<"Paid" | "Pending">(
    initialData?.status || "Paid",
  )
  const [eMethod, setEMethod] = useState(initialData?.payment_method || "Bank transfer")
  const [eRef, setERef] = useState(initialData?.receipt_reference || "")
  const [eNotes, setENotes] = useState(initialData?.notes || "")

  // Staff form state
  const [sName, setSName] = useState(initialData?.name || "")
  const [sPhone, setSPhone] = useState(initialData?.phone || "+91 ")
  const [sRole, setSRole] = useState<
    "Editor" | "Cameraman" | "Poster Designer" | "Other"
  >(initialData?.role || "Editor")
  const [sSalary, setSSalary] = useState(
    initialData?.salary !== undefined ? String(initialData.salary) : "",
  )
  const [sStatus, setSStatus] = useState<"Active" | "Inactive">(
    initialData?.status || "Active",
  )

  // Payment form state
  const [pClientId, setPClientId] = useState(targetId || clients[0]?.id || "")
  const [pAmount, setPAmount] = useState("")
  const [pDate, setPDate] = useState(defaultDate)
  const [pMethod, setPMethod] = useState<"Bank transfer" | "UPI" | "Cash" | "Card">(
    "Bank transfer",
  )
  const [pRef, setPRef] = useState("")
  const [pNotes, setPNotes] = useState("")

  // Deliverable form state
  const [dTitle, setDTitle] = useState("")
  const [dStaff, setDStaff] = useState(
    staff[0]?.name ? `${staff[0].name} (${staff[0].role})` : "Unassigned",
  )
  const [dStatus, setDStatus] = useState<"Pending" | "In Progress" | "Completed">(
    "Pending",
  )
  const [dCompDate, setDCompDate] = useState(defaultDate)

  // Staff Payment form state
  const [spStaffId, setSpStaffId] = useState(targetId || staff[0]?.id || "")
  const [spDate, setSpDate] = useState(defaultDate)
  const [spAmount, setSpAmount] = useState("")
  const [spType, setSpType] = useState<
    "Salary" | "Project Payment" | "Advance" | "Other"
  >("Salary")
  const [spClient, setSpClient] = useState("Company operations")
  const [spDesc, setSpDesc] = useState("")
  const [spMethod, setSpMethod] = useState("Bank transfer")
  const [spRef, setSpRef] = useState("")
  const [spStatus, setSpStatus] = useState<"Paid" | "Pending">("Paid")

  const [err, setErr] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const isEditing = Boolean(initialData)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setErr("")
    setSubmitting(true)

    try {
      if (type === "client") {
        if (!cName.trim() || !cBusiness.trim()) {
          throw new Error("Client and Business names are required.")
        }
        if (!isValidFinancialDate(cStart) || !isValidFinancialDate(cEnd)) {
          throw new Error(
            `Dates must be between ${MIN_FINANCIAL_DATE} and ${MAX_FINANCIAL_DATE}.`,
          )
        }
        if (cStart > cEnd) {
          throw new Error("Agreement start date cannot be after end date.")
        }
        const amt = parseFloat(cAmount) || 0
        if (amt < 0) {
          throw new Error("Monthly package amount cannot be negative.")
        }
        const vids = parseInt(cVideos, 10) || 0
        if (vids < 0) {
          throw new Error("Videos per month cannot be negative.")
        }
        const posts = parseInt(cPosters, 10) || 0
        if (posts < 0) {
          throw new Error("Posters per month cannot be negative.")
        }

        if (isEditing) {
          const updated = await updateClient(initialData.id, {
            name: cName.trim(),
            business: cBusiness.trim(),
            phone: cPhone.trim(),
            amount: amt,
            videos: vids,
            posters: posts,
            start_date: cStart,
            end_date: cEnd,
            status: cStatus,
            notes: cNotes.trim(),
          })
          await logCrmAction(
            "User",
            "Client Updated",
            `Updated client: ${cBusiness}`,
            formatMoney(amt),
          )
          onRecordSaved(`Client ${cBusiness} updated successfully in Supabase.`, updated)
        } else {
          const saved = await createClient({
            name: cName.trim(),
            business: cBusiness.trim(),
            phone: cPhone.trim(),
            amount: amt,
            videos: vids,
            posters: posts,
            start_date: cStart,
            end_date: cEnd,
            status: cStatus,
            notes: cNotes.trim(),
          })
          await logCrmAction(
            "User",
            "Client Added",
            `Registered client: ${cBusiness}`,
            formatMoney(amt),
          )
          onRecordSaved(`Client ${cBusiness} saved to Supabase successfully.`, saved)
        }
        close()
      } else if (type === "expense") {
        if (!isValidFinancialDate(eDate)) {
          throw new Error(
            `Expense date must be between ${MIN_FINANCIAL_DATE} and ${MAX_FINANCIAL_DATE}.`,
          )
        }
        const amt = parseFloat(eAmount)
        if (isNaN(amt) || amt < 0) {
          throw new Error("Please enter a valid expense amount.")
        }
        const related = clients.find((c) => c.id === eClientId)

        if (isEditing) {
          await updateExpense(initialData.id, {
            date: eDate,
            category: eCategory,
            description: eDesc.trim() || `${eCategory} expense`,
            recipient: eRecipient.trim() || "Vendor",
            staff_id: eStaffId || null,
            client_id: eClientId || null,
            client_name: related ? related.business : "—",
            amount: amt,
            status: eStatus,
            payment_method: eMethod,
            receipt_reference: eRef.trim(),
            notes: eNotes.trim(),
          })
          await logCrmAction(
            "User",
            "Expense Updated",
            `${eCategory}: ${eDesc || eRecipient}`,
            formatMoney(amt),
          )
          onRecordSaved("Expense updated in Supabase successfully.")
        } else {
          await createExpense({
            date: eDate,
            category: eCategory,
            description: eDesc.trim() || `${eCategory} expense`,
            recipient: eRecipient.trim() || "Vendor",
            staff_id: eStaffId || null,
            client_id: eClientId || null,
            client_name: related ? related.business : "—",
            amount: amt,
            status: eStatus,
            payment_method: eMethod,
            receipt_reference: eRef.trim(),
            notes: eNotes.trim(),
          })
          await logCrmAction(
            "User",
            "Expense Recorded",
            `${eCategory}: ${eDesc || eRecipient}`,
            formatMoney(amt),
          )
          onRecordSaved("Expense saved to Supabase successfully.")
        }
        close()
      } else if (type === "staff") {
        if (!sName.trim()) {
          throw new Error("Staff name is required.")
        }

        if (isEditing) {
          await updateStaff(initialData.id, {
            name: sName.trim(),
            phone: sPhone.trim(),
            role: sRole,
            salary: parseFloat(sSalary) || 0,
            status: sStatus,
          })
          await logCrmAction(
            "User",
            "Staff Updated",
            `Updated profile for ${sName}`,
          )
          onRecordSaved(`Staff profile for ${sName} updated in Supabase.`)
        } else {
          await createStaff({
            name: sName.trim(),
            phone: sPhone.trim(),
            role: sRole,
            salary: parseFloat(sSalary) || 0,
            status: sStatus,
          })
          await logCrmAction(
            "User",
            "Staff Added",
            `Created profile for ${sName}`,
          )
          onRecordSaved(`Staff profile for ${sName} saved to Supabase.`)
        }
        close()
      } else if (type === "payment") {
        if (!pClientId) {
          throw new Error("Please select a client.")
        }
        if (!isValidFinancialDate(pDate)) {
          throw new Error(
            `Payment date must be between ${MIN_FINANCIAL_DATE} and ${MAX_FINANCIAL_DATE}.`,
          )
        }
        const amt = parseFloat(pAmount)
        if (isNaN(amt) || amt <= 0) {
          throw new Error("Payment amount must be greater than zero.")
        }
        await createClientPayment({
          client_id: pClientId,
          amount: amt,
          payment_date: pDate,
          payment_method: pMethod,
          reference: pRef.trim(),
          notes: pNotes.trim(),
        })
        await logCrmAction(
          "User",
          "Client Payment Received",
          `Payment via ${pMethod}`,
          formatMoney(amt),
        )
        onRecordSaved("Client payment saved to Supabase successfully.")
        close()
      } else if (type === "video" || type === "poster") {
        if (!targetId) {
          throw new Error("Client reference missing.")
        }
        if (!dTitle.trim()) {
          throw new Error("Work title is required.")
        }
        await createDeliverable({
          client_id: targetId,
          title: dTitle.trim(),
          type: type === "video" ? "Video" : "Poster",
          assigned_staff: dStaff,
          status: dStatus,
          completion_date: dStatus === "Completed" ? dCompDate : null,
          month: selectedMonth,
        })
        await logCrmAction(
          "User",
          "Deliverable Added",
          `${type === "video" ? "Video" : "Poster"}: ${dTitle}`,
        )
        onRecordSaved(
          `${type === "video" ? "Video" : "Poster"} deliverable saved to Supabase.`,
        )
        close()
      } else if (type === "staff payment") {
        if (!spStaffId) {
          throw new Error("Please select a staff member.")
        }
        if (!isValidFinancialDate(spDate)) {
          throw new Error(
            `Payment date must be between ${MIN_FINANCIAL_DATE} and ${MAX_FINANCIAL_DATE}.`,
          )
        }
        const amt = parseFloat(spAmount)
        if (isNaN(amt) || amt <= 0) {
          throw new Error("Amount must be greater than zero.")
        }
        const pStaff = staff.find((s) => s.id === spStaffId)
        await createStaffPayment({
          staff_id: spStaffId,
          staff_name: pStaff?.name,
          payment_date: spDate,
          amount: amt,
          payment_type: spType,
          related_client: spClient,
          work_description: spDesc.trim(),
          payment_method: spMethod,
          reference: spRef.trim(),
          status: spStatus,
        })
        await logCrmAction(
          "User",
          "Staff Payment",
          `Paid to ${pStaff?.name || "Staff"}`,
          formatMoney(amt),
        )
        onRecordSaved("Staff payment saved to Supabase successfully.")
        close()
      }
    } catch (err: unknown) {
      setErr(
        err instanceof Error
          ? err.message
          : "An error occurred while communicating with Supabase.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  const title = isEditing
    ? `Edit ${type}`
    : type === "staff payment"
      ? "Record staff payment"
      : type === "video"
        ? "Add video deliverable"
        : type === "poster"
          ? "Add poster deliverable"
          : `Add ${type}`

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Supabase Database Record</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        {err && (
          <div
            style={{
              padding: "10px 14px",
              marginBottom: 16,
              background: "#fee2e2",
              color: "#b91c1c",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <strong>Error:</strong> {err}
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-grid">
          {type === "client" && (
            <>
              <Field
                label="Client contact name"
                placeholder="Full name"
                value={cName}
                onChange={setCName}
                required
              />
              <Field
                label="Business / company name"
                placeholder="e.g. Northstar Media"
                value={cBusiness}
                onChange={setCBusiness}
                required
              />
              <Field
                label="Phone number"
                placeholder="+91 "
                value={cPhone}
                onChange={setCPhone}
              />
              <Field
                label="Monthly package amount (₹)"
                type="number"
                placeholder="0"
                value={cAmount}
                onChange={setCAmount}
                required
              />
              <Field
                label="Videos per month"
                type="number"
                value={cVideos}
                onChange={setCVideos}
              />
              <Field
                label="Posters per month"
                type="number"
                value={cPosters}
                onChange={setCPosters}
              />
              <Field
                label="Agreement start date"
                type="date"
                value={cStart}
                onChange={setCStart}
                min={MIN_FINANCIAL_DATE}
                max={MAX_FINANCIAL_DATE}
                required
              />
              <Field
                label="Agreement end date"
                type="date"
                value={cEnd}
                onChange={setCEnd}
                min={MIN_FINANCIAL_DATE}
                max={MAX_FINANCIAL_DATE}
                required
              />
              <SelectField
                label="Status"
                value={cStatus}
                options={["Active", "Ending soon", "Inactive"]}
                onChange={(val) =>
                  setCStatus(val as "Active" | "Ending soon" | "Inactive")
                }
              />
              <Field
                label="Notes / Project details (optional)"
                placeholder="Important project notes, deliverable scope or terms"
                value={cNotes}
                onChange={setCNotes}
                isTextArea
                rows={3}
              />
            </>
          )}

          {type === "expense" && (
            <>
              <Field
                label="Expense date"
                type="date"
                value={eDate}
                onChange={setEDate}
                min={MIN_FINANCIAL_DATE}
                max={MAX_FINANCIAL_DATE}
                required
              />
              <SelectField
                label="Category"
                value={eCategory}
                options={[
                  "Staff Salary",
                  "Editor",
                  "Cameraman",
                  "Travel",
                  "Rent",
                  "Software",
                  "Equipment",
                  "Marketing",
                  "Other",
                ]}
                onChange={setECategory}
              />
              {eCategory === "Staff Salary" && staff.length > 0 && (
                <SelectField
                  label="Team member"
                  value={eStaffId}
                  options={[
                    { label: "Select team member...", value: "" },
                    ...staff.map((s) => ({
                      label: `${s.name} (${s.role})${s.salary > 0 ? ` — ₹${s.salary}` : ""}`,
                      value: s.id,
                    })),
                  ]}
                  onChange={(val) => {
                    setEStaffId(val)
                    const sel = staff.find((s) => s.id === val)
                    if (sel) {
                      setERecipient(sel.name)
                      if (!eAmount && sel.salary > 0) {
                        setEAmount(String(sel.salary))
                      }
                      if (!eDesc || eDesc === "Monthly staff salary") {
                        setEDesc(`${sel.name} — Monthly salary`)
                      }
                    }
                  }}
                />
              )}
              <Field
                label="Description"
                placeholder="Details of expense"
                value={eDesc}
                onChange={setEDesc}
                required
              />
              <Field
                label="Amount (₹)"
                type="number"
                placeholder="0"
                value={eAmount}
                onChange={setEAmount}
                required
              />
              <Field
                label="Recipient / vendor name"
                placeholder="Vendor or payee"
                value={eRecipient}
                onChange={setERecipient}
                required
              />
              <SelectField
                label="Related client / project"
                value={eClientId}
                options={[
                  { label: "Not related / General", value: "" },
                  ...clients.map((c) => ({
                    label: c.business,
                    value: c.id,
                  })),
                ]}
                onChange={setEClientId}
              />
              <SelectField
                label="Payment status"
                value={eStatus}
                options={["Paid", "Pending"]}
                onChange={(val) => setEStatus(val as "Paid" | "Pending")}
              />
              <SelectField
                label="Payment method"
                value={eMethod}
                options={["Bank transfer", "UPI", "Cash", "Card"]}
                onChange={setEMethod}
              />
              <Field
                label="Receipt / reference number"
                placeholder="Optional reference"
                value={eRef}
                onChange={setERef}
              />
              <Field
                label="Notes (optional)"
                placeholder="Additional notes or remarks"
                value={eNotes}
                onChange={setENotes}
              />
            </>
          )}

          {type === "staff" && (
            <>
              <Field
                label="Full name"
                placeholder="Staff member name"
                value={sName}
                onChange={setSName}
                required
              />
              <Field
                label="Phone number"
                placeholder="+91 "
                value={sPhone}
                onChange={setSPhone}
              />
              <SelectField
                label="Role"
                value={sRole}
                options={["Editor", "Cameraman", "Poster Designer", "Other"]}
                onChange={(val) =>
                  setSRole(
                    val as "Editor" | "Cameraman" | "Poster Designer" | "Other",
                  )
                }
              />
              <Field
                label="Monthly salary (if fixed, ₹)"
                type="number"
                placeholder="0"
                value={sSalary}
                onChange={setSSalary}
              />
              <SelectField
                label="Status"
                value={sStatus}
                options={["Active", "Inactive"]}
                onChange={(val) => setSStatus(val as "Active" | "Inactive")}
              />
            </>
          )}

          {type === "payment" && (
            <>
              <SelectField
                label="Client"
                value={pClientId}
                options={clients.map((c) => ({
                  label: c.business,
                  value: c.id,
                }))}
                onChange={setPClientId}
              />
              <Field
                label="Amount received (₹)"
                type="number"
                placeholder="0"
                value={pAmount}
                onChange={setPAmount}
                required
              />
              <Field
                label="Payment date"
                type="date"
                value={pDate}
                onChange={setPDate}
                min={MIN_FINANCIAL_DATE}
                max={MAX_FINANCIAL_DATE}
                required
              />
              <SelectField
                label="Payment method"
                value={pMethod}
                options={["Bank transfer", "UPI", "Cash", "Card"]}
                onChange={(val) =>
                  setPMethod(val as "Bank transfer" | "UPI" | "Cash" | "Card")
                }
              />
              <Field
                label="Transaction reference"
                placeholder="e.g. TXN987214"
                value={pRef}
                onChange={setPRef}
              />
              <Field
                label="Notes (optional)"
                placeholder="e.g. Package payment"
                value={pNotes}
                onChange={setPNotes}
              />
            </>
          )}

          {(type === "video" || type === "poster") && (
            <>
              <Field
                label="Deliverable title"
                placeholder="e.g. Product Launch Video"
                value={dTitle}
                onChange={setDTitle}
                required
              />
              <SelectField
                label="Assigned staff member"
                value={dStaff}
                options={[
                  "Unassigned",
                  ...staff.map((s) => `${s.name} (${s.role})`),
                ]}
                onChange={setDStaff}
              />
              <SelectField
                label="Status"
                value={dStatus}
                options={["Pending", "In Progress", "Completed"]}
                onChange={(val) =>
                  setDStatus(
                    val as "Pending" | "In Progress" | "Completed",
                  )
                }
              />
              {dStatus === "Completed" && (
                <Field
                  label="Completion date"
                  type="date"
                  value={dCompDate}
                  onChange={setDCompDate}
                  min={MIN_FINANCIAL_DATE}
                  max={MAX_FINANCIAL_DATE}
                />
              )}
            </>
          )}

          {type === "staff payment" && (
            <>
              <SelectField
                label="Staff member"
                value={spStaffId}
                options={staff.map((s) => ({
                  label: `${s.name} (${s.role})`,
                  value: s.id,
                }))}
                onChange={setSpStaffId}
              />
              <Field
                label="Payment date"
                type="date"
                value={spDate}
                onChange={setSpDate}
                min={MIN_FINANCIAL_DATE}
                max={MAX_FINANCIAL_DATE}
                required
              />
              <Field
                label="Amount (₹)"
                type="number"
                placeholder="0"
                value={spAmount}
                onChange={setSpAmount}
                required
              />
              <SelectField
                label="Payment type"
                value={spType}
                options={["Salary", "Project Payment", "Advance", "Other"]}
                onChange={(val) =>
                  setSpType(
                    val as "Salary" | "Project Payment" | "Advance" | "Other",
                  )
                }
              />
              <SelectField
                label="Related project / client"
                value={spClient}
                options={[
                  "Company operations",
                  ...clients.map((c) => c.business),
                ]}
                onChange={setSpClient}
              />
              <Field
                label="Work description"
                placeholder="e.g. October editing tasks"
                value={spDesc}
                onChange={setSpDesc}
              />
              <SelectField
                label="Payment method"
                value={spMethod}
                options={["Bank transfer", "UPI", "Cash", "Card"]}
                onChange={setSpMethod}
              />
              <Field
                label="Reference number"
                placeholder="e.g. PAY-102938"
                value={spRef}
                onChange={setSpRef}
              />
              <SelectField
                label="Payment status"
                value={spStatus}
                options={["Paid", "Pending"]}
                onChange={(val) => setSpStatus(val as "Paid" | "Pending")}
              />
            </>
          )}

          <div className="form-actions">
            <Button variant="outline" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving to Supabase..."
                : isEditing
                  ? "Update in Supabase"
                  : "Save to Supabase"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main App Entry Component ───────────────────────────────────────────────

export default function App() {
  const { step, isLoading, logout, user, email, role, isOwner, authorizedUser } = useAuth()
  const [page, setPage] = useState<Page>("Dashboard")
  const [mobileNav, setMobileNav] = useState(false)
  const [clientId, setClientId] = useState<string | null>(null)
  const [staffId, setStaffId] = useState<string | null>(null)
  const [modal, setModal] = useState<{
    type: string
    targetId?: string
    initialData?: any
  } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Financial Calendar: starts at October 2026
  const [selectedMonth, setSelectedMonth] = useState<string>(INITIAL_MONTH_KEY)

  // Real CRM database state (starts empty, loaded from Supabase / store)
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [payments, setPayments] = useState<ClientPaymentRecord[]>([])
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [staff, setStaff] = useState<StaffRecord[]>([])
  const [staffPayments, setStaffPayments] = useState<StaffPaymentRecord[]>([])
  const [deliverables, setDeliverables] = useState<DeliverableRecord[]>([])
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS)
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([])

  const [isDataLoading, setIsDataLoading] = useState(false)

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 3800)
  }

  // Load all actual records from Supabase
  const reloadData = async () => {
    setIsDataLoading(true)
    try {
      const [c, p, e, s, sp, d, set, a] = await Promise.all([
        fetchClients(),
        fetchClientPayments(),
        fetchExpenses(),
        fetchStaff(),
        fetchStaffPayments(),
        fetchDeliverables(),
        fetchCompanySettings(),
        fetchAuditLogs(),
      ])
      setClients(c)
      setPayments(p)
      setExpenses(e)
      setStaff(s)
      setStaffPayments(sp)
      setDeliverables(d)
      setSettings(set)
      setAuditLogs(a)
    } catch (err) {
      console.warn("[Filmdappa CRM] Data refresh error:", err)
    } finally {
      setIsDataLoading(false)
    }
  }

  // Only trigger full data fetch once the user is authenticated with a valid Supabase JWT
  useEffect(() => {
    if (step === "authenticated") {
      reloadData()
    }
  }, [step])

  // Derive display name: user's full_name from authorized_users, user_metadata, or "Lakshan Sudhakar"
  const userMetaName = user?.user_metadata?.full_name as string | undefined
  const displayName =
    authorizedUser?.full_name && authorizedUser.full_name.trim().length > 0
      ? authorizedUser.full_name
      : userMetaName && userMetaName.trim().length > 0 && userMetaName !== "Faizal Dappa"
        ? userMetaName
        : "Lakshan Sudhakar"

  const initials =
    displayName
      .split(" ")
      .map((w: string) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "LS"

  const currency = settings.currency || "INR — Indian Rupee"

  const title = useMemo(
    () =>
      clientId
        ? "Client details"
        : staffId
          ? "Staff profile"
          : page === "Add Client"
            ? "Add new client"
            : page,
    [clientId, staffId, page],
  )

  // Listen for browser URL / popstate / hashchange events
  useEffect(() => {
    const handleUrlChange = () => {
      const route = parseRouteFromUrl()
      setPage(route.page)
      setClientId(route.clientId)
      setStaffId(route.staffId)
    }

    handleUrlChange()
    window.addEventListener("popstate", handleUrlChange)
    window.addEventListener("hashchange", handleUrlChange)
    return () => {
      window.removeEventListener("popstate", handleUrlChange)
      window.removeEventListener("hashchange", handleUrlChange)
    }
  }, [])

  // ─── Delete Handlers with User Confirmation ───────────────────────────────

  const handleDeleteClient = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete client "${name}" from Supabase? This will also remove related payments and deliverables.`,
      )
    ) {
      return
    }
    try {
      await deleteClient(id)
      await logCrmAction("User", "Client Deleted", `Deleted client: ${name}`)
      showToast(`Client "${name}" deleted from Supabase.`)
      setClientId(null)
      updateBrowserUrl("Clients")
      await reloadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete client.")
    }
  }

  const handleDeleteExpense = async (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this expense record from Supabase?",
      )
    ) {
      return
    }
    try {
      await deleteExpense(id)
      await logCrmAction("User", "Expense Deleted", "Removed expense entry")
      showToast("Expense record deleted from Supabase.")
      await reloadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete expense.")
    }
  }

  const handleDeleteStaff = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete staff profile "${name}" from Supabase?`,
      )
    ) {
      return
    }
    try {
      await deleteStaff(id)
      await logCrmAction("User", "Staff Deleted", `Removed staff: ${name}`)
      showToast(`Staff profile for "${name}" deleted from Supabase.`)
      setStaffId(null)
      updateBrowserUrl("Staff")
      await reloadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete staff.")
    }
  }

  const handleDeletePayment = async (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this payment record from Supabase?",
      )
    ) {
      return
    }
    try {
      await deleteClientPayment(id)
      await logCrmAction("User", "Payment Deleted", "Removed payment record")
      showToast("Payment record deleted from Supabase.")
      await reloadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete payment.")
    }
  }

  const handleDeleteStaffPayment = async (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this staff payment record from Supabase?",
      )
    ) {
      return
    }
    try {
      await deleteStaffPayment(id)
      await logCrmAction(
        "User",
        "Staff Payment Deleted",
        "Removed staff payment record",
      )
      showToast("Staff payment record deleted from Supabase.")
      await reloadData()
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to delete staff payment.",
      )
    }
  }

  const handleDeleteDeliverable = async (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this deliverable from Supabase?",
      )
    ) {
      return
    }
    try {
      await deleteDeliverable(id)
      showToast("Deliverable removed from Supabase.")
      await reloadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete deliverable.")
    }
  }

  const handleUpdateDeliverableStatus = async (
    id: string,
    newStatus: "Pending" | "In Progress" | "Completed",
  ) => {
    try {
      await updateDeliverableStatus(id, newStatus)
      showToast(`Deliverable status updated to ${newStatus}.`)
      await reloadData()
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Failed to update deliverable status.",
      )
    }
  }

  // ─── Auth Gate ────────────────────────────────────────────────────────────

  if (isLoading && step === "email") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#FFF4B8",
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.04em" }}>
          FILMDAPPA
        </div>
      </div>
    )
  }

  if (step !== "authenticated") {
    return <LoginPage />
  }

  const go = (next: Page) => {
    setPage(next)
    setClientId(null)
    setStaffId(null)
    setMobileNav(false)
    updateBrowserUrl(next)
  }

  const openAddClient = () => {
    setPage("Add Client")
    setClientId(null)
    setStaffId(null)
    setMobileNav(false)
    updateBrowserUrl("Add Client")
  }

  const handleOpenClient = (id: string) => {
    setClientId(id)
    setStaffId(null)
    setMobileNav(false)
    updateBrowserUrl("Clients", id)
  }

  const handleOpenStaff = (id: string) => {
    setStaffId(id)
    setClientId(null)
    setMobileNav(false)
    updateBrowserUrl("Staff", null, id)
  }

  const handleBackToClients = () => {
    setClientId(null)
    updateBrowserUrl("Clients")
  }

  const handleBackToStaff = () => {
    setStaffId(null)
    updateBrowserUrl("Staff")
  }

  let content: ReactNode
  if (page === "Add Client") {
    content = (
      <AddClientPage
        onCancel={() => {
          setPage("Clients")
          updateBrowserUrl("Clients")
        }}
        onClientCreated={async (newClient) => {
          showToast(`Client "${newClient.business}" saved to Supabase successfully.`)
          await reloadData()
          setClientId(newClient.id)
          setPage("Clients")
          updateBrowserUrl("Clients", newClient.id)
        }}
        currency={currency}
        selectedMonth={selectedMonth}
      />
    )
  } else if (clientId) {
    content = (
      <ClientDetails
        id={clientId}
        clients={clients}
        payments={payments}
        expenses={expenses}
        deliverables={deliverables}
        back={handleBackToClients}
        openModal={(type, cId, initData) =>
          setModal({ type, targetId: cId || clientId, initialData: initData })
        }
        onDeleteClient={handleDeleteClient}
        onDeletePayment={handleDeletePayment}
        onDeleteExpense={handleDeleteExpense}
        onDeleteDeliverable={handleDeleteDeliverable}
        onUpdateDeliverableStatus={handleUpdateDeliverableStatus}
        currency={currency}
      />
    )
  } else if (staffId) {
    content = (
      <StaffDetails
        id={staffId}
        staff={staff}
        staffPayments={staffPayments}
        expenses={expenses}
        selectedMonth={selectedMonth}
        back={handleBackToStaff}
        openModal={(type, sId, initData) =>
          setModal({ type, targetId: sId || staffId, initialData: initData })
        }
        onDeleteStaff={handleDeleteStaff}
        onDeleteStaffPayment={handleDeleteStaffPayment}
        onDeleteExpense={handleDeleteExpense}
        currency={currency}
      />
    )
  } else if (page === "Dashboard") {
    content = (
      <Dashboard
        openPage={go}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        clients={clients}
        payments={payments}
        expenses={expenses}
        staffPayments={staffPayments}
        currency={currency}
        userName={displayName}
      />
    )
  } else if (page === "Clients") {
    content = (
      <Clients
        clients={clients}
        openClient={handleOpenClient}
        openAddClient={openAddClient}
        openModal={(type) => {
          if (type === "client") {
            openAddClient()
          } else {
            setModal({ type })
          }
        }}
        currency={currency}
      />
    )
  } else if (page === "Expenses") {
    content = (
      <Expenses
        expenses={expenses}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        openModal={(type, _tId, initData) =>
          setModal({ type, initialData: initData })
        }
        onDeleteExpense={handleDeleteExpense}
        currency={currency}
      />
    )
  } else if (page === "Staff") {
    content = (
      <Staff
        staff={staff}
        staffPayments={staffPayments}
        expenses={expenses}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        openStaff={handleOpenStaff}
        openModal={(type, sId, initData) =>
          setModal({ type, targetId: sId, initialData: initData })
        }
        onDeleteExpense={handleDeleteExpense}
        onDeleteStaffPayment={handleDeleteStaffPayment}
        currency={currency}
      />
    )
  } else if (page === "Monthly Reports") {
    content = (
      <Reports
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        clients={clients}
        payments={payments}
        expenses={expenses}
        staff={staff}
        staffPayments={staffPayments}
        currency={currency}
        settings={settings}
      />
    )
  } else if (page === "Audit Logs") {
    content = <AuditLogs logs={auditLogs} />
  } else {
    content = (
      <Settings
        settings={settings}
        onSave={async (newSet) => {
          await saveCompanySettings(newSet)
          setSettings(newSet)
          showToast("Company profile saved to Supabase successfully.")
        }}
      />
    )
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <img
            src={filmdappaLogo}
            alt="Filmdappa logo"
            className="brand-logo"
          />
          <span className="brand-text">
            <strong>FILMDAPPA</strong>
            <small>MEDIA COMPANY</small>
          </span>
          <button className="mobile-close" onClick={() => setMobileNav(false)}>
            <Icon name="close" />
          </button>
        </div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.label}
              className={
                (page === item.label ||
                  (item.label === "Clients" && page === "Add Client")) &&
                !clientId &&
                !staffId
                  ? "active"
                  : ""
              }
              onClick={() => go(item.label)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{initials}</span>
          <span>
            <strong>{displayName}</strong>
            <small>{user?.email ?? email ?? "user@filmdappa.com"}</small>
          </span>
          <button onClick={logout} title="Log out">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      {mobileNav && (
        <div className="nav-overlay" onClick={() => setMobileNav(false)} />
      )}

      <div className="main-column">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileNav(true)}>
            <Icon name="menu" />
          </button>
          <span>{title}</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
            {isDataLoading && (
              <span
                style={{
                  fontSize: "12px",
                  color: "#d97706",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(245, 158, 11, 0.1)",
                  padding: "4px 8px",
                  borderRadius: "6px",
                }}
              >
                ● Syncing Supabase
              </span>
            )}
            <div className="topbar-user">
              <span>{initials}</span>
            </div>
          </div>
        </header>
        <main className="content">{content}</main>
      </div>

      {modal && (
        <Modal
          type={modal.type}
          targetId={modal.targetId}
          initialData={modal.initialData}
          selectedMonth={selectedMonth}
          clients={clients}
          staff={staff}
          close={() => setModal(null)}
          onRecordSaved={(msg, newRecord) => {
            showToast(msg)
            reloadData()
            if (modal.type === "client" && newRecord?.id) {
              setClientId(newRecord.id)
              setPage("Clients")
              updateBrowserUrl("Clients", newRecord.id)
            }
          }}
        />
      )}

      {toast && <div className="toast-notice">{toast}</div>}
    </div>
  )
}
