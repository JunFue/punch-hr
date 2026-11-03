import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { CompanySettings, PayrollRecord, UserProfile } from "@/types/hr";
import { MONTH_NAMES } from "@/lib/payroll-engine";

function fmtAmount(num: number): string {
  return `PHP ${num.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function downloadPayslipPDF(
  record: PayrollRecord,
  employee: UserProfile,
  settings: CompanySettings
): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const monthName = MONTH_NAMES[record.pay_period_month - 1] || "Month";
  const periodLabel = `${monthName} ${record.pay_period_year} (Q${record.quarter})`;

  // Header Banner
  doc.setFillColor(20, 83, 45); // Emerald 900
  doc.rect(0, 0, 210, 34, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(settings.wellness_center_name.toUpperCase(), 14, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(settings.wellness_center_address, 14, 21);
  doc.text("OFFICIAL MONTH-END EMPLOYEE PAYSLIP", 14, 27);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`PAY PERIOD: ${periodLabel.toUpperCase()}`, 196, 16, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Slip ID: ${record.id.slice(0, 16)}`, 196, 22, { align: "right" });
  doc.text(
    `Generated: ${new Date(record.generated_at).toLocaleDateString("en-PH")}`,
    196,
    27,
    { align: "right" }
  );

  // Employee Details Box
  doc.setTextColor(30, 41, 59);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 40, 182, 28, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Employee Name:", 18, 48);
  doc.text("Employee Code:", 18, 55);
  doc.text("Department / Role:", 18, 62);

  doc.setFont("helvetica", "normal");
  doc.text(employee.full_name, 54, 48);
  doc.text(employee.employee_code, 54, 55);
  doc.text(`${employee.department} — ${employee.position}`, 54, 62);

  doc.setFont("helvetica", "bold");
  doc.text("Days Physically Present:", 118, 48);
  doc.text("Qtr Regular Leaves (Max 3):", 118, 55);
  doc.text("Special Leaves (Itemized):", 118, 62);

  doc.setFont("helvetica", "normal");
  doc.text(
    `${record.days_physically_present} day(s) (Divisor: ${record.working_days_divisor}d)`,
    168,
    48
  );
  doc.text(
    `${record.regular_leaves_this_month} this mo / ${record.regular_leaves_quarter_to_date} in Q${record.quarter}`,
    168,
    55
  );
  doc.text(`${record.special_leaves_count} day(s) (Bypasses Quota)`, 168, 62);

  // Earnings Table
  autoTable(doc, {
    startY: 74,
    margin: { left: 14, right: 14 },
    head: [["EARNINGS & ALLOWANCES", "CALCULATION / DETAILS", "AMOUNT"]],
    body: [
      [
        "Monthly Basic Salary",
        `Base monthly compensation (${
          record.paid_leaves_used_this_month > 0
            ? `${record.paid_leaves_used_this_month} valid paid leave(s) kept basic intact`
            : "Full monthly base"
        })`,
        fmtAmount(record.basic_salary),
      ],
      [
        "Daily Attendance Shares",
        employee.daily_share_eligible
          ? `${record.days_physically_present} physical day(s) present x ${fmtAmount(
              record.daily_share_rate
            )}/day (leaves forfeit daily share)`
          : "Not eligible for daily share allowance",
        fmtAmount(record.total_daily_shares),
      ],
      [
        "End-of-Month Performance Perk",
        "Monthly wellness & service performance incentive",
        fmtAmount(record.performance_perk),
      ],
      [
        {
          content: "GROSS EARNINGS",
          styles: { fontStyle: "bold", fillColor: [240, 253, 244] },
        },
        {
          content: "Total Earnings before Deductions",
          styles: { fontStyle: "bold", fillColor: [240, 253, 244] },
        },
        {
          content: fmtAmount(record.gross_earnings),
          styles: {
            fontStyle: "bold",
            halign: "right",
            fillColor: [240, 253, 244],
          },
        },
      ],
    ],
    headStyles: {
      fillColor: [22, 101, 52],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 84 },
      2: { cellWidth: 40, halign: "right" },
    },
    styles: { fontSize: 9, cellPadding: 3 },
  });

  const afterEarningsY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 6;

  // Deductions Table
  autoTable(doc, {
    startY: afterEarningsY,
    margin: { left: 14, right: 14 },
    head: [["DEDUCTIONS & LEAVE PENALTIES", "CALCULATION / POLICY", "AMOUNT"]],
    body: [
      [
        "Excess Quarterly Leave Penalty",
        record.excess_leave_days > 0
          ? `${record.excess_leave_days} excess day(s) beyond 3-day Q${
              record.quarter
            } limit x ${fmtAmount(record.excess_leave_deduction_rate)}/day`
          : `0 excess days (Within 3-day Q${record.quarter} paid leave limit)`,
        fmtAmount(record.excess_leave_deduction_amount),
      ],
      [
        "SSS Contribution",
        record.sss_deduction > 0 ? "Applied (Opted-in / Active)" : "Not opted-in (Voluntary)",
        fmtAmount(record.sss_deduction),
      ],
      [
        "PhilHealth Premium",
        record.philhealth_deduction > 0
          ? "Applied (Opted-in / Active)"
          : "Not opted-in (Voluntary)",
        fmtAmount(record.philhealth_deduction),
      ],
      [
        "Wellness Group Insurance",
        record.insurance_deduction > 0
          ? "Applied (Opted-in / Active)"
          : "Not opted-in (Voluntary)",
        fmtAmount(record.insurance_deduction),
      ],
      [
        {
          content: "TOTAL DEDUCTIONS",
          styles: { fontStyle: "bold", fillColor: [254, 242, 242] },
        },
        {
          content: "Combined Leave Penalties & Contributions",
          styles: { fontStyle: "bold", fillColor: [254, 242, 242] },
        },
        {
          content: fmtAmount(record.total_deductions),
          styles: {
            fontStyle: "bold",
            halign: "right",
            fillColor: [254, 242, 242],
          },
        },
      ],
    ],
    headStyles: {
      fillColor: [153, 27, 27],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 84 },
      2: { cellWidth: 40, halign: "right" },
    },
    styles: { fontSize: 9, cellPadding: 3 },
  });

  const afterDeductionsY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 6;

  // Uniquely Itemized Special Leaves Section (Always shown to satisfy business requirement)
  const specialRows =
    record.special_leave_details && record.special_leave_details.length > 0
      ? record.special_leave_details.map((sp) => [
          `${sp.start_date} to ${sp.end_date}`,
          `${sp.days_count} day(s)`,
          sp.reason,
          "PHP 0.00 (No Basic Deduction)",
        ])
      : [
          [
            "None taken this period",
            "0 day(s)",
            "No Admin-granted Special Leaves recorded in this month",
            "PHP 0.00",
          ],
        ];

  autoTable(doc, {
    startY: afterDeductionsY,
    margin: { left: 14, right: 14 },
    head: [
      [
        `ITEMIZED ADMIN-GRANTED SPECIAL LEAVES (TOTAL: ${record.special_leaves_count} DAY[S])`,
        "DAYS",
        "REASON / AUTHORIZATION",
        "BASIC SALARY IMPACT",
      ],
    ],
    body: specialRows,
    headStyles: {
      fillColor: [30, 58, 138], // Indigo/Blue 900
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 22 },
      2: { cellWidth: 78 },
      3: { cellWidth: 40, halign: "right" },
    },
    styles: { fontSize: 8.5, cellPadding: 2.8 },
  });

  const afterSpecialY =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 8;

  // Net Pay Box
  doc.setFillColor(20, 83, 45);
  doc.roundedRect(14, afterSpecialY, 182, 20, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("NET TAKE-HOME PAY", 20, afterSpecialY + 12.5);
  doc.setFontSize(15);
  doc.text(fmtAmount(record.net_pay), 190, afterSpecialY + 13, {
    align: "right",
  });

  // Footer
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    "Policy Note: Employees receive 12 annual leaves (strict max 3 paid leaves/quarter). Paid leaves preserve basic salary but forfeit daily share.",
    14,
    afterSpecialY + 28
  );
  doc.text(
    "Leaves beyond 3/quarter deduct from basic salary. Admin-granted Special Leaves bypass quarterly limits and are itemized above.",
    14,
    afterSpecialY + 33
  );

  const safeCode = employee.employee_code.replace(/[^a-zA-Z0-9_-]/g, "");
  doc.save(`PunchHR_Payslip_${safeCode}_${monthName}_${record.pay_period_year}.pdf`);
}
