// ============================================================================
// Filmdappa CRM — Professional PDF Report Generator
// Generates high-fidelity, multi-page financial PDF reports with:
//  1. Filmdappa company logo at the top
//  2. Centered, transparent Filmdappa logo watermark in the background
//  3. Executive KPI summary, Client-wise revenue, Staff compensation, Expenses
//  4. Consistent pagination, running headers, and footers ("Page X of Y")
// ============================================================================

import {
  ClientRecord,
  ClientPaymentRecord,
  ExpenseRecord,
  StaffRecord,
  StaffPaymentRecord,
  CompanySettings,
  isStaffSalaryExpense,
  expenseMatchesStaff,
} from './crmData'
import { MonthOption, formatDateDisplay } from './calendar'
import filmdappaLogo from '../assets/filmdappa-logo.jpg'

export type ReportType = 'comprehensive' | 'clients' | 'staff' | 'expenses'

export interface GeneratePdfOptions {
  monthInfo: MonthOption
  clients: ClientRecord[]
  payments: ClientPaymentRecord[]
  expenses: ExpenseRecord[]
  staff: StaffRecord[]
  staffPayments: StaffPaymentRecord[]
  settings?: CompanySettings
  currency: string
  reportType?: ReportType
  preparedBy?: string
}

function escapePdfText(text: string): string {
  if (!text) return ''
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, (ch) => {
      if (ch === '—' || ch === '–') return '-'
      if (ch === '’' || ch === '‘') return "'"
      if (ch === '“' || ch === '”') return '"'
      if (ch === '₹') return 'Rs.'
      if (ch === '•') return '*'
      if (ch === '·') return '|'
      return ' '
    })
}

function formatPdfMoney(value: number, currency: string = 'INR'): string {
  const rounded = Math.round(value || 0)
  const isNeg = rounded < 0
  const abs = Math.abs(rounded)
  const formatted = abs.toLocaleString('en-IN')
  const prefix = isNeg ? '-' : ''

  if (currency.includes('USD')) return `${prefix}$${formatted}`
  if (currency.includes('EUR')) return `${prefix}EUR ${formatted}`
  if (currency.includes('GBP')) return `${prefix}GBP ${formatted}`
  return `${prefix}INR ${formatted}`
}

function approximateTextWidth(text: string, fontSize: number): number {
  return escapePdfText(text).length * fontSize * 0.53
}

class PdfBuilder {
  private pages: string[] = []
  private currentPageContent: string[] = []
  private currentY: number = 740
  private logoBytes?: Uint8Array
  private hasLogoImage: boolean = false
  private monthLabel: string
  private companyName: string
  private pageNumberPlaceholders: { pageIndex: number; pos: number }[] = []

  // A4 Dimensions: 595.28 x 841.89 pt
  readonly pageWidth = 595.28
  readonly pageHeight = 841.89
  readonly margin = 40
  readonly contentWidth = 515.28 // 595.28 - 80

  constructor(monthLabel: string, companyName: string, logoBytes?: Uint8Array) {
    this.monthLabel = monthLabel
    this.companyName = companyName
    this.logoBytes = logoBytes
    this.hasLogoImage = Boolean(logoBytes && logoBytes.length > 0)
    this.initPage(true)
  }

  private initPage(isFirstPage: boolean) {
    this.currentPageContent = []

    // 1. Draw Centered Watermark first so it sits behind all content
    if (this.hasLogoImage) {
      const wSize = 340
      const wX = (this.pageWidth - wSize) / 2
      const wY = (this.pageHeight - wSize) / 2
      this.currentPageContent.push(
        'q\n' +
        '/GSWatermark gs\n' +
        `${wSize} 0 0 ${wSize} ${wX.toFixed(2)} ${wY.toFixed(2)} cm\n` +
        '/Logo Do\n' +
        'Q\n' +
        '/GSNormal gs\n'
      )
    }

    // 2. Running Header on page 2+
    if (!isFirstPage) {
      if (this.hasLogoImage) {
        this.currentPageContent.push(
          'q\n' +
          `28 0 0 28 ${this.margin} 790 cm\n` +
          '/Logo Do\n' +
          'Q\n'
        )
      }

      this.currentPageContent.push(
        'BT\n' +
        '/F2 9 Tf\n' +
        '0.1 0.1 0.1 rg\n' +
        `${this.margin + (this.hasLogoImage ? 34 : 0)} 800 Td\n` +
        `(${escapePdfText(this.companyName)}) Tj\n` +
        '/F1 8 Tf\n' +
        '0.4 0.4 0.4 rg\n' +
        '0 -11 Td\n' +
        `(${escapePdfText(this.monthLabel)} | Financial Report) Tj\n` +
        'ET\n'
      )

      // Thin divider
      this.currentPageContent.push(
        '0.88 0.88 0.88 RG 0.75 w\n' +
        `${this.margin} 780 m ${this.pageWidth - this.margin} 780 l S\n`
      )

      this.currentY = 760
    }
  }

  public newPage() {
    this.pages.push(this.currentPageContent.join(''))
    this.initPage(false)
  }

  public ensureSpace(neededHeight: number) {
    if (this.currentY - neededHeight < 55) {
      this.newPage()
    }
  }

  public drawMainHeader(title: string, subtitle: string, period: string, generatedDate: string, businessEmail: string) {
    const topY = 750

    // Logo image at top left
    if (this.hasLogoImage) {
      this.currentPageContent.push(
        'q\n' +
        `46 0 0 46 ${this.margin} ${topY} cm\n` +
        '/Logo Do\n' +
        'Q\n'
      )
    }

    const textX = this.margin + (this.hasLogoImage ? 54 : 0)

    // Company branding & Subtitle
    this.currentPageContent.push(
      'BT\n' +
      '/F2 15 Tf\n' +
      '0.07 0.07 0.07 rg\n' +
      `${textX} ${topY + 30} Td\n` +
      `(${escapePdfText(this.companyName.toUpperCase())}) Tj\n` +
      '/F2 8.5 Tf\n' +
      '0.7 0.4 0.05 rg\n' + // Warm amber/gold branding
      '0 -13 Td\n' +
      '(INTERNAL FINANCIAL REPORT & AUDIT LEDGER) Tj\n' +
      '/F1 8 Tf\n' +
      '0.45 0.45 0.45 rg\n' +
      '0 -11 Td\n' +
      `(${escapePdfText(businessEmail)} | Official Media Operations) Tj\n` +
      'ET\n'
    )

    // Right-aligned metadata box
    const badgeW = 160
    const badgeH = 46
    const badgeX = this.pageWidth - this.margin - badgeW
    const badgeY = topY

    this.currentPageContent.push(
      '0.96 0.96 0.97 rg\n' +
      '0.85 0.85 0.87 RG\n' +
      '0.75 w\n' +
      `${badgeX} ${badgeY} ${badgeW} ${badgeH} re B\n` +
      'BT\n' +
      '/F2 8.5 Tf\n' +
      '0.1 0.1 0.1 rg\n' +
      `${badgeX + 10} ${badgeY + 31} Td\n` +
      `(${escapePdfText(title)}) Tj\n` +
      '/F1 7.5 Tf\n' +
      '0.35 0.35 0.35 rg\n' +
      '0 -11 Td\n' +
      `(Period: ${escapePdfText(period)}) Tj\n` +
      '0 -10 Td\n' +
      `(Generated: ${escapePdfText(generatedDate)}) Tj\n` +
      'ET\n'
    )

    // Divider line
    this.currentPageContent.push(
      '0.82 0.82 0.85 RG 1 w\n' +
      `${this.margin} 735 m ${this.pageWidth - this.margin} 735 l S\n`
    )

    this.currentY = 718
  }

  public drawKpiCards(cards: { label: string; value: string; sub: string; highlight?: boolean }[]) {
    this.ensureSpace(120)

    const gap = 8
    const cardW = (this.contentWidth - gap * 2) / 3
    const cardH = 46

    cards.forEach((card, index) => {
      const col = index % 3
      const row = Math.floor(index / 3)
      const x = this.margin + col * (cardW + gap)
      const y = this.currentY - row * (cardH + gap) - cardH

      // Card Background & Border
      if (card.highlight) {
        this.currentPageContent.push(
          '1.0 0.98 0.91 rg\n' + // Light warm yellow/gold
          '0.85 0.55 0.1 RG\n' +
          '1.2 w\n' +
          `${x} ${y} ${cardW} ${cardH} re B\n`
        )
      } else {
        this.currentPageContent.push(
          '0.97 0.97 0.98 rg\n' +
          '0.87 0.87 0.89 RG\n' +
          '0.75 w\n' +
          `${x} ${y} ${cardW} ${cardH} re B\n`
        )
      }

      // Card Texts
      this.currentPageContent.push(
        'BT\n' +
        '/F2 7.5 Tf\n' +
        (card.highlight ? '0.55 0.35 0.05 rg\n' : '0.4 0.4 0.45 rg\n') +
        `${x + 8} ${y + 32} Td\n` +
        `(${escapePdfText(card.label.toUpperCase())}) Tj\n` +
        '/F2 11 Tf\n' +
        (card.highlight ? '0.1 0.1 0.1 rg\n' : '0.05 0.05 0.05 rg\n') +
        '0 -13 Td\n' +
        `(${escapePdfText(card.value)}) Tj\n` +
        '/F1 6.8 Tf\n' +
        '0.5 0.5 0.55 rg\n' +
        '0 -9 Td\n' +
        `(${escapePdfText(card.sub)}) Tj\n` +
        'ET\n'
      )
    })

    const totalRows = Math.ceil(cards.length / 3)
    this.currentY -= totalRows * (cardH + gap) + 12
  }

  public drawSectionHeading(title: string, subtitle?: string) {
    this.ensureSpace(34)

    this.currentPageContent.push(
      'BT\n' +
      '/F2 11 Tf\n' +
      '0.1 0.1 0.1 rg\n' +
      `${this.margin} ${this.currentY} Td\n` +
      `(${escapePdfText(title)}) Tj\n`
    )

    if (subtitle) {
      this.currentPageContent.push(
        '/F1 7.5 Tf\n' +
        '0.45 0.45 0.45 rg\n' +
        '0 -10 Td\n' +
        `(${escapePdfText(subtitle)}) Tj\n`
      )
      this.currentY -= 18
    } else {
      this.currentY -= 14
    }

    this.currentPageContent.push('ET\n')
  }

  public drawTable(
    columns: { header: string; width: number; align?: 'left' | 'right' | 'center' }[],
    rows: (string | number)[][],
    summaryRow?: (string | number)[]
  ) {
    const rowHeight = 18
    const headerHeight = 20

    const renderHeader = () => {
      // Header background
      this.currentPageContent.push(
        '0.12 0.12 0.14 rg\n' +
        `${this.margin} ${this.currentY - headerHeight} ${this.contentWidth} ${headerHeight} re f\n`
      )

      let curX = this.margin
      columns.forEach((col) => {
        let textX = curX + 6
        if (col.align === 'right') {
          const w = approximateTextWidth(col.header, 7.5)
          textX = curX + col.width - w - 6
        } else if (col.align === 'center') {
          const w = approximateTextWidth(col.header, 7.5)
          textX = curX + (col.width - w) / 2
        }

        this.currentPageContent.push(
          'BT\n' +
          '/F2 7.5 Tf\n' +
          '1.0 1.0 1.0 rg\n' +
          `${textX.toFixed(2)} ${(this.currentY - 13.5).toFixed(2)} Td\n` +
          `(${escapePdfText(col.header)}) Tj\n` +
          'ET\n'
        )
        curX += col.width
      })

      this.currentY -= headerHeight
    }

    // Render initial header
    this.ensureSpace(headerHeight + rowHeight * Math.min(rows.length, 3))
    renderHeader()

    // Render rows
    rows.forEach((row, rowIndex) => {
      if (this.currentY - rowHeight < 55) {
        this.newPage()
        renderHeader()
      }

      // Zebra background
      if (rowIndex % 2 === 1) {
        this.currentPageContent.push(
          '0.97 0.97 0.98 rg\n' +
          `${this.margin} ${this.currentY - rowHeight} ${this.contentWidth} ${rowHeight} re f\n`
        )
      }

      // Bottom row divider line
      this.currentPageContent.push(
        '0.9 0.9 0.92 RG 0.5 w\n' +
        `${this.margin} ${this.currentY - rowHeight} m ${this.pageWidth - this.margin} ${this.currentY - rowHeight} l S\n`
      )

      let curX = this.margin
      row.forEach((cellVal, colIndex) => {
        const col = columns[colIndex]
        const strVal = String(cellVal ?? '—')
        let textX = curX + 6
        if (col.align === 'right') {
          const w = approximateTextWidth(strVal, 7.5)
          textX = curX + col.width - w - 6
        } else if (col.align === 'center') {
          const w = approximateTextWidth(strVal, 7.5)
          textX = curX + (col.width - w) / 2
        }

        this.currentPageContent.push(
          'BT\n' +
          '/F1 7.5 Tf\n' +
          '0.15 0.15 0.15 rg\n' +
          `${textX.toFixed(2)} ${(this.currentY - 12.5).toFixed(2)} Td\n` +
          `(${escapePdfText(strVal)}) Tj\n` +
          'ET\n'
        )
        curX += col.width
      })

      this.currentY -= rowHeight
    })

    // Summary Row if present
    if (summaryRow && summaryRow.length > 0) {
      if (this.currentY - rowHeight < 55) {
        this.newPage()
        renderHeader()
      }

      // Thick top border
      this.currentPageContent.push(
        '0.2 0.2 0.2 RG 1.2 w\n' +
        `${this.margin} ${this.currentY} m ${this.pageWidth - this.margin} ${this.currentY} l S\n` +
        '0.93 0.94 0.96 rg\n' +
        `${this.margin} ${this.currentY - rowHeight} ${this.contentWidth} ${rowHeight} re f\n`
      )

      let curX = this.margin
      summaryRow.forEach((cellVal, colIndex) => {
        const col = columns[colIndex]
        const strVal = String(cellVal ?? '')
        let textX = curX + 6
        if (col.align === 'right') {
          const w = approximateTextWidth(strVal, 8)
          textX = curX + col.width - w - 6
        } else if (col.align === 'center') {
          const w = approximateTextWidth(strVal, 8)
          textX = curX + (col.width - w) / 2
        }

        this.currentPageContent.push(
          'BT\n' +
          '/F2 8 Tf\n' +
          '0.05 0.05 0.05 rg\n' +
          `${textX.toFixed(2)} ${(this.currentY - 12.5).toFixed(2)} Td\n` +
          `(${escapePdfText(strVal)}) Tj\n` +
          'ET\n'
        )
        curX += col.width
      })

      this.currentY -= rowHeight
    }

    this.currentY -= 14
  }

  public drawNetIncomeSummaryBox(
    totalRevenue: number,
    totalExpenses: number,
    netIncome: number,
    profitMargin: string,
    currency: string
  ) {
    this.ensureSpace(82)

    const boxH = 74
    const boxY = this.currentY - boxH

    // Clean callout box
    this.currentPageContent.push(
      '0.97 0.98 0.99 rg\n' +
      '0.82 0.85 0.89 RG\n' +
      '1 w\n' +
      `${this.margin} ${boxY} ${this.contentWidth} ${boxH} re B\n`
    )

    // Left breakdown
    this.currentPageContent.push(
      'BT\n' +
      '/F2 8.5 Tf\n' +
      '0.2 0.2 0.2 rg\n' +
      `${this.margin + 14} ${boxY + 54} Td\n` +
      '(FINANCIAL STATEMENT RECONCILIATION) Tj\n' +
      '/F1 7.8 Tf\n' +
      '0.35 0.35 0.35 rg\n' +
      '0 -14 Td\n' +
      `(+ Total Cash Income: ${formatPdfMoney(totalRevenue, currency)}) Tj\n` +
      '0 -12 Td\n' +
      `(- Total Operating & Salary Expenses: ${formatPdfMoney(totalExpenses, currency)}) Tj\n` +
      '0 -12 Td\n' +
      '(= Net Income / Profit = Total Income - Total Expenses) Tj\n' +
      'ET\n'
    )

    // Right large Net Income badge
    const badgeW = 160
    const badgeX = this.pageWidth - this.margin - badgeW - 14
    const badgeY = boxY + 12

    this.currentPageContent.push(
      '1 1 1 rg\n' +
      (netIncome >= 0 ? '0.1 0.6 0.2 RG\n' : '0.8 0.2 0.2 RG\n') +
      '1.2 w\n' +
      `${badgeX} ${badgeY} ${badgeW} 50 re B\n` +
      'BT\n' +
      '/F2 8 Tf\n' +
      (netIncome >= 0 ? '0.1 0.5 0.15 rg\n' : '0.7 0.15 0.15 rg\n') +
      `${badgeX + 12} ${badgeY + 34} Td\n` +
      '(FINAL NET PROFIT / BALANCE) Tj\n' +
      '/F2 13 Tf\n' +
      '0.05 0.05 0.05 rg\n' +
      '0 -15 Td\n' +
      `(${formatPdfMoney(netIncome, currency)}) Tj\n` +
      '/F1 7.5 Tf\n' +
      '0.4 0.4 0.4 rg\n' +
      '0 -10 Td\n' +
      `(${profitMargin} Operating Margin) Tj\n` +
      'ET\n'
    )

    this.currentY -= boxH + 16
  }

  public finishPages() {
    this.pages.push(this.currentPageContent.join(''))
    const totalPages = this.pages.length

    // Append footers to each page with accurate Page X of Y
    this.pages = this.pages.map((content, pageIdx) => {
      const footer =
        '0.88 0.88 0.9 RG 0.5 w\n' +
        `${this.margin} 42 m ${this.pageWidth - this.margin} 42 l S\n` +
        'BT\n' +
        '/F1 7 Tf\n' +
        '0.5 0.5 0.55 rg\n' +
        `${this.margin} 30 Td\n` +
        `(${escapePdfText(this.companyName)} -- Internal Confidential Financial Ledger) Tj\n` +
        '/F2 7.5 Tf\n' +
        '0.3 0.3 0.3 rg\n' +
        `${this.pageWidth - this.margin - 75} 30 Td\n` +
        `(Page ${pageIdx + 1} of ${totalPages}) Tj\n` +
        'ET\n'
      return content + footer
    })
  }

  public build(): Uint8Array {
    this.finishPages()

    const parts: Uint8Array[] = []
    const offsets: number[] = []
    let currentOffset = 0

    const encoder = new TextEncoder()

    function writeStr(str: string) {
      const bytes = encoder.encode(str)
      parts.push(bytes)
      currentOffset += bytes.length
    }

    function writeBytes(bytes: Uint8Array) {
      parts.push(bytes)
      currentOffset += bytes.length
    }

    function startObj(num: number) {
      offsets[num] = currentOffset
      writeStr(`${num} 0 obj\n`)
    }

    function endObj() {
      writeStr('endobj\n')
    }

    // Header
    writeStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')

    // Object 1: Catalog
    startObj(1)
    writeStr('<< /Type /Catalog /Pages 2 0 R >>\n')
    endObj()

    const totalPages = this.pages.length
    const fontHelveticaObj = 3
    const fontBoldObj = 4
    const fontObliqueObj = 5
    const gsWatermarkObj = 6
    const gsNormalObj = 7
    const logoImgObj = 8

    // Object 2: Pages Root
    // Each page will have: pageObj = 8 + i*2 + 1, contentObj = 8 + i*2 + 2
    const pageObjStart = 9
    const pageRefs = Array.from({ length: totalPages }, (_, i) => `${pageObjStart + i * 2} 0 R`).join(' ')

    startObj(2)
    writeStr(`<< /Type /Pages /Kids [${pageRefs}] /Count ${totalPages} >>\n`)
    endObj()

    // Object 3: Helvetica
    startObj(fontHelveticaObj)
    writeStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n')
    endObj()

    // Object 4: Helvetica-Bold
    startObj(fontBoldObj)
    writeStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n')
    endObj()

    // Object 5: Helvetica-Oblique
    startObj(fontObliqueObj)
    writeStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>\n')
    endObj()

    // Object 6: ExtGState Watermark (opacity 0.06 - subtle, light-grey background)
    startObj(gsWatermarkObj)
    writeStr('<< /Type /ExtGState /ca 0.06 /CA 0.06 >>\n')
    endObj()

    // Object 7: ExtGState Normal (opacity 1.0)
    startObj(gsNormalObj)
    writeStr('<< /Type /ExtGState /ca 1.0 /CA 1.0 >>\n')
    endObj()

    // Object 8: Logo Image XObject
    startObj(logoImgObj)
    if (this.hasLogoImage && this.logoBytes) {
      writeStr(
        `<< /Type /XObject /Subtype /Image /Width 1024 /Height 1024 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${this.logoBytes.length} >>\nstream\n`
      )
      writeBytes(this.logoBytes)
      writeStr('\nendstream\n')
    } else {
      // Minimal 1x1 dummy image if logo missing
      const dummy = new Uint8Array([0xff, 0xff, 0xff])
      writeStr(
        `<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${dummy.length} >>\nstream\n`
      )
      writeBytes(dummy)
      writeStr('\nendstream\n')
    }
    endObj()

    // Page Objects & Content Streams
    this.pages.forEach((pageContent, idx) => {
      const pageObjNum = pageObjStart + idx * 2
      const contentObjNum = pageObjNum + 1
      const contentBytes = encoder.encode(pageContent)

      // Page Dict
      startObj(pageObjNum)
      writeStr(
        `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${fontHelveticaObj} 0 R /F2 ${fontBoldObj} 0 R /F3 ${fontObliqueObj} 0 R >> /XObject << /Logo ${logoImgObj} 0 R >> /ExtGState << /GSWatermark ${gsWatermarkObj} 0 R /GSNormal ${gsNormalObj} 0 R >> >> /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Contents ${contentObjNum} 0 R >>\n`
      )
      endObj()

      // Content Stream
      startObj(contentObjNum)
      writeStr(`<< /Length ${contentBytes.length} >>\nstream\n`)
      writeBytes(contentBytes)
      writeStr('\nendstream\n')
      endObj()
    })

    const totalObjects = pageObjStart + totalPages * 2 - 1

    // xref table
    const startXref = currentOffset
    writeStr(`xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`)
    for (let i = 1; i <= totalObjects; i++) {
      const off = offsets[i] || 0
      writeStr(`${String(off).padStart(10, '0')} 00000 n \n`)
    }

    // Trailer
    writeStr(
      `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`
    )

    // Concatenate all parts into a single Uint8Array
    const totalLength = parts.reduce((acc, p) => acc + p.length, 0)
    const combined = new Uint8Array(totalLength)
    let pos = 0
    for (const p of parts) {
      combined.set(p, pos)
      pos += p.length
    }

    return combined
  }
}

/**
 * Loads the company logo as an array buffer from the project assets.
 */
async function loadLogoBytes(): Promise<Uint8Array | undefined> {
  try {
    const res = await fetch(filmdappaLogo)
    if (res.ok) {
      const ab = await res.arrayBuffer()
      return new Uint8Array(ab)
    }
  } catch (err) {
    console.warn('[Filmdappa CRM] Could not fetch logo asset for PDF:', err)
  }
  return undefined
}

/**
 * Generates the full professional PDF document from live CRM data.
 */
export async function buildPdfDocument(options: GeneratePdfOptions): Promise<Uint8Array> {
  const {
    monthInfo,
    clients,
    payments,
    expenses,
    staff,
    staffPayments,
    settings,
    currency,
    reportType = 'comprehensive',
  } = options

  const logoBytes = await loadLogoBytes()
  const companyName = settings?.company_name || 'Filmdappa Media Company'
  const businessEmail = settings?.business_email || 'accounts@filmdappa.com'
  const generatedDate = formatDateDisplay(new Date().toISOString().slice(0, 10))

  const pdf = new PdfBuilder(monthInfo.label, companyName, logoBytes)

  // 1. Data Calculations (Ensuring 100% financial consistency)
  const activeClients = clients.filter(
    (c) =>
      c.status !== 'Inactive' &&
      c.start_date <= monthInfo.endDate &&
      c.end_date >= monthInfo.startDate
  )
  const totalRevenue = activeClients.reduce((sum, c) => sum + Number(c.amount || 0), 0)

  const monthPayments = payments.filter((p) => p.payment_date && p.payment_date.startsWith(monthInfo.key))
  const cashReceived = monthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const outstanding = Math.max(0, totalRevenue - cashReceived)

  const monthExpenses = expenses.filter((e) => e.date && e.date.startsWith(monthInfo.key))
  const totalLedgerExpenses = monthExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)

  const legacyMonthStaffPayments = staffPayments.filter(
    (sp) =>
      sp.payment_date &&
      sp.payment_date.startsWith(monthInfo.key) &&
      !expenses.some(
        (e) =>
          e.id === sp.id ||
          (e.date === sp.payment_date &&
            Number(e.amount) === Number(sp.amount) &&
            isStaffSalaryExpense(e))
      )
  )
  const legacyStaffTotal = legacyMonthStaffPayments.reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

  // Total Expenses includes Staff Salary exactly once
  const totalExpenses = totalLedgerExpenses + legacyStaffTotal

  // Net Income = Cash Received − Total Expenses
  const netIncome = cashReceived - totalExpenses
  const profitMargin =
    cashReceived > 0
      ? ((netIncome / cashReceived) * 100).toFixed(1) + '%'
      : '0.0%'

  // Staff compensation metrics
  const staffSalaryExpenses = monthExpenses.filter((e) => isStaffSalaryExpense(e))
  const staffPaid =
    staffSalaryExpenses
      .filter((e) => e.status === 'Paid')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
    legacyMonthStaffPayments
      .filter((sp) => sp.status === 'Paid')
      .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

  const staffPending =
    staffSalaryExpenses
      .filter((e) => e.status === 'Pending')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
    legacyMonthStaffPayments
      .filter((sp) => sp.status === 'Pending')
      .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

  const totalStaffCompensation = staffPaid + staffPending

  // Expense categories
  const expenseCategories: Record<string, { count: number; total: number }> = {}
  monthExpenses.forEach((e) => {
    const cat = e.category || 'General Expense'
    if (!expenseCategories[cat]) expenseCategories[cat] = { count: 0, total: 0 }
    expenseCategories[cat].count += 1
    expenseCategories[cat].total += Number(e.amount || 0)
  })
  if (legacyStaffTotal > 0) {
    if (!expenseCategories['Staff Salary (Legacy)']) {
      expenseCategories['Staff Salary (Legacy)'] = { count: legacyMonthStaffPayments.length, total: 0 }
    }
    expenseCategories['Staff Salary (Legacy)'].total += legacyStaffTotal
  }

  // Draw Header
  const reportTitles: Record<ReportType, string> = {
    comprehensive: 'MONTHLY FINANCIAL REPORT',
    clients: 'CLIENT REVENUE & COLLECTIONS',
    staff: 'STAFF SALARY & COMPENSATION',
    expenses: 'MONTHLY EXPENSE LEDGER',
  }

  pdf.drawMainHeader(
    reportTitles[reportType] || 'FINANCIAL REPORT',
    `Financial performance and audit ledger for ${monthInfo.label}`,
    monthInfo.label,
    generatedDate,
    businessEmail
  )

  // Draw KPI Summary Grid
  pdf.drawKpiCards([
    {
      label: 'Total Client Revenue',
      value: formatPdfMoney(totalRevenue, currency),
      sub: `${activeClients.length} active client agreement${activeClients.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Cash Inflow Received',
      value: formatPdfMoney(cashReceived, currency),
      sub: totalRevenue > 0 ? `${Math.round((cashReceived / totalRevenue) * 100)}% collections rate` : '0% collected',
    },
    {
      label: 'Pending Receivables',
      value: formatPdfMoney(outstanding, currency),
      sub: outstanding > 0 ? 'Outstanding client dues' : 'All accounts settled',
    },
    {
      label: 'Total Expenses (All Costs)',
      value: formatPdfMoney(totalExpenses, currency),
      sub: 'Operating costs + Staff salaries',
    },
    {
      label: 'Staff Salary & Payments',
      value: formatPdfMoney(totalStaffCompensation, currency),
      sub: `${formatPdfMoney(staffPending, currency)} pending payment`,
    },
    {
      label: 'Net Balance (Profit / Loss)',
      value: formatPdfMoney(netIncome, currency),
      sub: `${profitMargin} Operating Margin`,
      highlight: true,
    },
  ])

  // SECTION 1: Client-wise Revenue & Receivables Table
  if (reportType === 'comprehensive' || reportType === 'clients') {
    pdf.drawSectionHeading(
      'Client Revenue & Collections Ledger',
      'Breakdown of retainer agreements, realized cash inflow and outstanding balance by client'
    )

    const clientColumns = [
      { header: 'Business / Client', width: 145 },
      { header: 'Agreement Period', width: 120 },
      { header: 'Monthly Retainer', width: 85, align: 'right' as const },
      { header: 'Cash Received', width: 85, align: 'right' as const },
      { header: 'Pending Balance', width: 80, align: 'right' as const },
    ]

    const clientRows = activeClients.map((c) => {
      const cRec = monthPayments
        .filter((p) => p.client_id === c.id)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0)
      const cDue = Math.max(0, Number(c.amount || 0) - cRec)

      return [
        c.business || c.name,
        `${formatDateDisplay(c.start_date)} - ${formatDateDisplay(c.end_date)}`,
        formatPdfMoney(Number(c.amount || 0), currency),
        formatPdfMoney(cRec, currency),
        formatPdfMoney(cDue, currency),
      ]
    })

    const summaryRow = [
      'Total Active Clients',
      `${activeClients.length} accounts`,
      formatPdfMoney(totalRevenue, currency),
      formatPdfMoney(cashReceived, currency),
      formatPdfMoney(outstanding, currency),
    ]

    pdf.drawTable(clientColumns, clientRows, summaryRow)
  }

  // SECTION 2: Staff Salary & Team Compensation
  if (reportType === 'comprehensive' || reportType === 'staff') {
    pdf.drawSectionHeading(
      'Staff Salaries & Compensation Records',
      'Monthly salaries, project stipends, paid amounts and pending team compensation'
    )

    const staffColumns = [
      { header: 'Team Member', width: 135 },
      { header: 'Designation / Role', width: 100 },
      { header: 'Base Structure', width: 95, align: 'right' as const },
      { header: 'Paid This Month', width: 95, align: 'right' as const },
      { header: 'Pending Due', width: 90, align: 'right' as const },
    ]

    const staffRows = staff.map((s) => {
      const sSalaryExpenses = monthExpenses.filter((e) => isStaffSalaryExpense(e) && expenseMatchesStaff(e, s))
      const sLegacyPayments = legacyMonthStaffPayments.filter((sp) => sp.staff_id === s.id)

      const sPaid =
        sSalaryExpenses
          .filter((e) => e.status === 'Paid')
          .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
        sLegacyPayments
          .filter((sp) => sp.status === 'Paid')
          .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

      const sPending =
        sSalaryExpenses
          .filter((e) => e.status === 'Pending')
          .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
        sLegacyPayments
          .filter((sp) => sp.status === 'Pending')
          .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

      return [
        s.name,
        s.role || 'Team Member',
        s.salary > 0 ? `${formatPdfMoney(s.salary, currency)}/mo` : 'Project Rate',
        formatPdfMoney(sPaid, currency),
        formatPdfMoney(sPending, currency),
      ]
    })

    const summaryRow = [
      'Total Team Members',
      `${staff.length} staff`,
      '—',
      formatPdfMoney(staffPaid, currency),
      formatPdfMoney(staffPending, currency),
    ]

    pdf.drawTable(staffColumns, staffRows, summaryRow)
  }

  // SECTION 3: Operating Expenses by Category
  if (reportType === 'comprehensive' || reportType === 'expenses') {
    pdf.drawSectionHeading(
      'Operating & Salary Expenses by Category',
      'All business operating costs, software licenses, production travel and staff salaries recorded'
    )

    const expenseCatColumns = [
      { header: 'Category Name', width: 215 },
      { header: 'Transactions', width: 90, align: 'center' as const },
      { header: 'Total Outflow', width: 110, align: 'right' as const },
      { header: '% of Total', width: 100, align: 'right' as const },
    ]

    const expenseCatRows = Object.entries(expenseCategories).map(([cat, info]) => {
      const pct = totalExpenses > 0 ? ((info.total / totalExpenses) * 100).toFixed(1) + '%' : '0.0%'
      return [cat, `${info.count} recorded`, formatPdfMoney(info.total, currency), pct]
    })

    const summaryRow = [
      'Total Business Outflow',
      `${monthExpenses.length + legacyMonthStaffPayments.length} entries`,
      formatPdfMoney(totalExpenses, currency),
      '100.0%',
    ]

    pdf.drawTable(expenseCatColumns, expenseCatRows, summaryRow)
  }

  // FINAL STATEMENT: Net Profit / Financial Reconciliation
  pdf.drawNetIncomeSummaryBox(cashReceived, totalExpenses, netIncome, profitMargin, currency)

  return pdf.build()
}

/**
 * Downloads the generated PDF report directly to the client's device.
 */
export async function downloadPdfReport(options: GeneratePdfOptions): Promise<void> {
  const bytes = await buildPdfDocument(options)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)

  const safeMonth = options.monthInfo.key.replace(/[^a-zA-Z0-9_-]/g, '_')
  const reportType = options.reportType || 'comprehensive'
  const fileName = `Filmdappa_${reportType}_report_${safeMonth}.pdf`

  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/**
 * Opens an elegant HTML-rendered print preview with the exact logo and transparent watermark.
 */
export function openPrintableReport(options: GeneratePdfOptions): void {
  const {
    monthInfo,
    clients,
    payments,
    expenses,
    staff,
    staffPayments,
    settings,
    currency,
  } = options

  const companyName = settings?.company_name || 'Filmdappa Media Company'
  const businessEmail = settings?.business_email || 'accounts@filmdappa.com'
  const phone = settings?.phone_number || '+91 98765 00000'
  const generatedDate = formatDateDisplay(new Date().toISOString().slice(0, 10))

  const activeClients = clients.filter(
    (c) =>
      c.status !== 'Inactive' &&
      c.start_date <= monthInfo.endDate &&
      c.end_date >= monthInfo.startDate
  )
  const totalRevenue = activeClients.reduce((sum, c) => sum + Number(c.amount || 0), 0)

  const monthPayments = payments.filter((p) => p.payment_date && p.payment_date.startsWith(monthInfo.key))
  const cashReceived = monthPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const outstanding = Math.max(0, totalRevenue - cashReceived)

  const monthExpenses = expenses.filter((e) => e.date && e.date.startsWith(monthInfo.key))
  const totalLedgerExpenses = monthExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)

  const legacyMonthStaffPayments = staffPayments.filter(
    (sp) =>
      sp.payment_date &&
      sp.payment_date.startsWith(monthInfo.key) &&
      !expenses.some(
        (e) =>
          e.id === sp.id ||
          (e.date === sp.payment_date &&
            Number(e.amount) === Number(sp.amount) &&
            isStaffSalaryExpense(e))
      )
  )
  const legacyStaffTotal = legacyMonthStaffPayments.reduce((sum, sp) => sum + Number(sp.amount || 0), 0)
  const totalExpenses = totalLedgerExpenses + legacyStaffTotal
  const netIncome = cashReceived - totalExpenses
  const profitMargin =
    cashReceived > 0
      ? ((netIncome / cashReceived) * 100).toFixed(1) + '%'
      : '0.0%'

  const staffSalaryExpenses = monthExpenses.filter((e) => isStaffSalaryExpense(e))
  const staffPaid =
    staffSalaryExpenses
      .filter((e) => e.status === 'Paid')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
    legacyMonthStaffPayments
      .filter((sp) => sp.status === 'Paid')
      .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

  const staffPending =
    staffSalaryExpenses
      .filter((e) => e.status === 'Pending')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0) +
    legacyMonthStaffPayments
      .filter((sp) => sp.status === 'Pending')
      .reduce((sum, sp) => sum + Number(sp.amount || 0), 0)

  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapePdfText(companyName)} - ${monthInfo.label} Report</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111;
      margin: 0;
      padding: 20px;
      position: relative;
      background: #fff;
    }
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 450px;
      height: 450px;
      opacity: 0.05;
      pointer-events: none;
      z-index: 0;
    }
    .content-wrap {
      position: relative;
      z-index: 1;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #111;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    .header-logo {
      width: 50px;
      height: 50px;
      border-radius: 8px;
    }
    .header-titles h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .header-titles p {
      margin: 2px 0 0;
      font-size: 11px;
      color: #666;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 25px;
    }
    .kpi-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      background: #f9fafb;
    }
    .kpi-card.highlight {
      background: #fef3c7;
      border-color: #d97706;
    }
    .kpi-card span {
      display: block;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #6b7280;
    }
    .kpi-card strong {
      display: block;
      font-size: 17px;
      margin: 4px 0 2px;
    }
    .kpi-card small {
      font-size: 10px;
      color: #9ca3af;
    }
    h2 {
      font-size: 13px;
      font-weight: 700;
      margin: 20px 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 11px;
    }
    th {
      background: #111;
      color: #fff;
      text-align: left;
      padding: 8px 10px;
      font-size: 10px;
      text-transform: uppercase;
    }
    td {
      padding: 7px 10px;
      border-bottom: 1px solid #e5e7eb;
    }
    tr:nth-child(even) td {
      background: #f9fafb;
    }
    .total-row td {
      font-weight: 800;
      background: #f3f4f6 !important;
      border-top: 1.5px solid #111;
    }
    .reconciliation {
      border: 1.5px solid #111;
      border-radius: 8px;
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fdfdfd;
      margin-top: 25px;
    }
    .footer {
      border-top: 1px solid #e5e7eb;
      margin-top: 30px;
      padding-top: 10px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #666;
    }
    @media print {
      .no-print { display: none; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <img src="${filmdappaLogo}" class="watermark" alt="Filmdappa watermark" />
  <div class="content-wrap">
    <div class="no-print" style="margin-bottom: 15px; display: flex; justify-content: flex-end; gap: 10px;">
      <button onclick="window.print()" style="padding: 8px 16px; background: #111; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Print / Save as PDF</button>
    </div>
    <div class="header">
      <div class="header-brand">
        <img src="${filmdappaLogo}" class="header-logo" alt="Logo" />
        <div class="header-titles">
          <h1>${companyName.toUpperCase()}</h1>
          <p>INTERNAL FINANCIAL REPORT & AUDIT LEDGER · ${businessEmail} · ${phone}</p>
        </div>
      </div>
      <div style="text-align: right; font-size: 11px;">
        <strong>${monthInfo.label}</strong><br/>
        <span style="color: #666;">Generated: ${generatedDate}</span>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <span>Total Client Revenue</span>
        <strong>${formatPdfMoney(totalRevenue, currency)}</strong>
        <small>${activeClients.length} active clients</small>
      </div>
      <div class="kpi-card">
        <span>Cash Inflow Received</span>
        <strong>${formatPdfMoney(cashReceived, currency)}</strong>
        <small>Realized client payments</small>
      </div>
      <div class="kpi-card">
        <span>Pending Receivables</span>
        <strong>${formatPdfMoney(outstanding, currency)}</strong>
        <small>Due payments</small>
      </div>
      <div class="kpi-card">
        <span>Total Expenses</span>
        <strong>${formatPdfMoney(totalExpenses, currency)}</strong>
        <small>Operating costs + Salaries</small>
      </div>
      <div class="kpi-card">
        <span>Staff Compensation</span>
        <strong>${formatPdfMoney(staffPaid + staffPending, currency)}</strong>
        <small>${formatPdfMoney(staffPending, currency)} pending</small>
      </div>
      <div class="kpi-card highlight">
        <span style="color: #92400e;">Net Profit / Balance</span>
        <strong style="color: #92400e;">${formatPdfMoney(netIncome, currency)}</strong>
        <small style="color: #92400e;">${profitMargin} margin</small>
      </div>
    </div>

    <h2>Client Revenue & Collections</h2>
    <table>
      <thead>
        <tr>
          <th>Client / Business</th>
          <th>Period</th>
          <th style="text-align: right;">Package</th>
          <th style="text-align: right;">Received</th>
          <th style="text-align: right;">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${activeClients.map((c) => {
          const rec = monthPayments.filter((p) => p.client_id === c.id).reduce((s, p) => s + Number(p.amount || 0), 0)
          const due = Math.max(0, Number(c.amount || 0) - rec)
          return `<tr>
            <td><strong>${c.business}</strong></td>
            <td>${formatDateDisplay(c.start_date)} - ${formatDateDisplay(c.end_date)}</td>
            <td style="text-align: right;">${formatPdfMoney(c.amount, currency)}</td>
            <td style="text-align: right;">${formatPdfMoney(rec, currency)}</td>
            <td style="text-align: right;">${formatPdfMoney(due, currency)}</td>
          </tr>`
        }).join('')}
        <tr class="total-row">
          <td>Total</td>
          <td>${activeClients.length} clients</td>
          <td style="text-align: right;">${formatPdfMoney(totalRevenue, currency)}</td>
          <td style="text-align: right;">${formatPdfMoney(cashReceived, currency)}</td>
          <td style="text-align: right;">${formatPdfMoney(outstanding, currency)}</td>
        </tr>
      </tbody>
    </table>

    <h2>Staff Compensation</h2>
    <table>
      <thead>
        <tr>
          <th>Team Member</th>
          <th>Role</th>
          <th style="text-align: right;">Structure</th>
          <th style="text-align: right;">Paid</th>
          <th style="text-align: right;">Pending</th>
        </tr>
      </thead>
      <tbody>
        ${staff.map((s) => {
          const sExpenses = monthExpenses.filter((e) => isStaffSalaryExpense(e) && expenseMatchesStaff(e, s))
          const sLegacy = legacyMonthStaffPayments.filter((sp) => sp.staff_id === s.id)
          const pd = sExpenses.filter((e) => e.status === 'Paid').reduce((sum, e) => sum + Number(e.amount || 0), 0) + sLegacy.filter((sp) => sp.status === 'Paid').reduce((sum, sp) => sum + Number(sp.amount || 0), 0)
          const pnd = sExpenses.filter((e) => e.status === 'Pending').reduce((sum, e) => sum + Number(e.amount || 0), 0) + sLegacy.filter((sp) => sp.status === 'Pending').reduce((sum, sp) => sum + Number(sp.amount || 0), 0)
          return `<tr>
            <td><strong>${s.name}</strong></td>
            <td>${s.role}</td>
            <td style="text-align: right;">${s.salary > 0 ? formatPdfMoney(s.salary, currency) + '/mo' : 'Project'}</td>
            <td style="text-align: right;">${formatPdfMoney(pd, currency)}</td>
            <td style="text-align: right;">${formatPdfMoney(pnd, currency)}</td>
          </tr>`
        }).join('')}
        <tr class="total-row">
          <td>Total</td>
          <td>${staff.length} staff</td>
          <td></td>
          <td style="text-align: right;">${formatPdfMoney(staffPaid, currency)}</td>
          <td style="text-align: right;">${formatPdfMoney(staffPending, currency)}</td>
        </tr>
      </tbody>
    </table>

    <div class="reconciliation">
      <div>
        <strong style="font-size: 13px;">Reconciliation Statement</strong>
        <p style="margin: 4px 0 0; font-size: 11px; color: #555;">Net Balance = Cash Received (${formatPdfMoney(cashReceived, currency)}) − Total Expenses (${formatPdfMoney(totalExpenses, currency)})</p>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 10px; font-weight: 700; color: #666; text-transform: uppercase;">Net Income</span>
        <div style="font-size: 20px; font-weight: 800; color: ${netIncome >= 0 ? '#15803d' : '#dc2626'};">${formatPdfMoney(netIncome, currency)}</div>
        <small style="color: #666;">${profitMargin} margin</small>
      </div>
    </div>

    <div class="footer">
      <span>Filmdappa Media Company · Confidential Internal Record</span>
      <span>Page 1 of 1</span>
    </div>
  </div>
</body>
</html>`

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}
