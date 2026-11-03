import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Punch-HR | Wellness Center HR, GPS Attendance & Dynamic Payroll",
  description:
    "Customized HR and Payroll web application for Punch Wellness & Recovery Center built with Next.js and Supabase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
