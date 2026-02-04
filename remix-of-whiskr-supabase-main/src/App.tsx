import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "./lib/auth";
import { NotificationPreferencesProvider } from "./lib/notificationPreferences";
import { useMessageNotifications } from "./hooks/use-message-notifications";
import { useAssignmentNotifications } from "./hooks/use-assignment-notifications";
import { DashboardLayout } from "./components/layout/DashboardLayout";

// Lazy load all page components for code splitting
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ReferralLanding = lazy(() => import("./pages/ReferralLanding"));
const ChoosePlan = lazy(() => import("./pages/ChoosePlan"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Patients = lazy(() => import("./pages/Patients"));
const PatientDetail = lazy(() => import("./pages/PatientDetail"));
const PatientForm = lazy(() => import("./pages/PatientForm"));
const ConsultWorkspace = lazy(() => import("./pages/ConsultWorkspace"));

const Consults = lazy(() => import("./pages/Consults"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Messages = lazy(() => import("./pages/Messages"));
const Templates = lazy(() => import("./pages/Templates"));
const Support = lazy(() => import("./pages/Support"));
const Affiliate = lazy(() => import("./pages/Affiliate"));
const Admin = lazy(() => import("./pages/Admin"));
const Billing = lazy(() => import("./pages/Billing"));
const MasterAdmin = lazy(() => import("./pages/MasterAdmin"));
const UserFeedback = lazy(() => import("./pages/UserFeedback"));
const SupportManagement = lazy(() => import("./pages/SupportManagement"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));
const Diagnostics = lazy(() => import("./pages/Diagnostics"));
const RolePermissions = lazy(() => import("./pages/RolePermissions"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const TestOTP = lazy(() => import("./pages/TestOTP"));
const MoneyBackGuarantee = lazy(() => import("./pages/MoneyBackGuarantee"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentCanceled = lazy(() => import("./pages/PaymentCanceled"));
const UpgradeRequired = lazy(() => import("./pages/UpgradeRequired"));
const TrialExpired = lazy(() => import("./pages/TrialExpired"));
const LoginHistory = lazy(() => import("./pages/LoginHistory"));
// PostRecordingOptions removed - SOAP now auto-generates after recording/typing
const SOAPEditor = lazy(() => import("./pages/SOAPEditor"));
const WellnessEditor = lazy(() => import("./pages/WellnessEditor"));
const ProcedureEditor = lazy(() => import("./pages/ProcedureEditor"));
const CaseSummary = lazy(() => import("./pages/CaseSummary"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const AuditTrail = lazy(() => import("./pages/AuditTrail"));

const queryClient = new QueryClient();

// Wrapper component to use notification hooks (only when authenticated)
function AppNotifications() {
  useMessageNotifications();
  useAssignmentNotifications();
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-right" />
        <BrowserRouter>
          <AuthProvider>
            <NotificationPreferencesProvider>
              <AppNotifications />
              <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>}>
              <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/choose-plan" element={<ChoosePlan />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/refer/:code" element={<ReferralLanding />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/money-back-guarantee" element={<MoneyBackGuarantee />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/test-otp" element={<TestOTP />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/payment-canceled" element={<PaymentCanceled />} />
            <Route path="/upgrade-required" element={<UpgradeRequired />} />
            <Route path="/trial-expired" element={<TrialExpired />} />
            
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/patients" element={<Patients />} />
              <Route path="/patients/new" element={<PatientForm />} />
              <Route path="/patients/:patientId" element={<PatientDetail />} />
              <Route path="/patients/:patientId/edit" element={<PatientForm />} />
              <Route path="/consults/new/:patientId" element={<ConsultWorkspace />} />
              
            <Route path="/consults/:consultId" element={<ConsultWorkspace />} />
              {/* PostRecordingOptions route removed - now handled by auto SOAP generation */}
              <Route path="/soap-editor/:consultId" element={<SOAPEditor />} />
              <Route path="/wellness-editor/:consultId" element={<WellnessEditor />} />
              <Route path="/procedure-editor/:consultId" element={<ProcedureEditor />} />
              <Route path="/case-summary/:consultId" element={<CaseSummary />} />
              <Route path="/consults" element={<Consults />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/diagnostics" element={<Diagnostics />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/support" element={<Support />} />
              <Route path="/affiliate" element={<Affiliate />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/permissions" element={<RolePermissions />} />
              <Route path="/admin/audit-trail" element={<AuditTrail />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/master-admin" element={<MasterAdmin />} />
              <Route path="/user-feedback" element={<UserFeedback />} />
              <Route path="/support-management" element={<SupportManagement />} />
              <Route path="/account" element={<AccountSettings />} />
              <Route path="/login-history" element={<LoginHistory />} />
            </Route>
            
              <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </NotificationPreferencesProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
