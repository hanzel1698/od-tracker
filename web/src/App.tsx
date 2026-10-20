import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { Login } from '@/features/auth/Login'
import { Layout } from '@/components/Layout'
import { ConfirmProvider, Skeleton } from '@/components/ui'
import { OdDialogProvider } from '@/features/ods/OdDialogs'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { OdList } from '@/features/ods/OdList'
import { OdDetail } from '@/features/ods/OdDetail'
import { NewOd } from '@/features/ods/NewOd'
import { ClosureWizard } from '@/features/closure/ClosureWizard'
import { FdDetail, FdList } from '@/features/fds/FdList'
import { BulkInterest } from '@/features/interest/BulkInterest'
import { SavingsList } from '@/features/savings/SavingsList'
import { BranchList } from '@/features/branches/BranchList'
import { Settings } from '@/features/settings/Settings'
import { ImportExport } from '@/features/io/ImportExport'
import { OpeningBalances } from '@/features/onboarding/OpeningBalances'

function Gate() {
  const { session, loading } = useAuth()
  if (loading)
    return (
      <div className="mx-auto max-w-md space-y-3 p-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24" />
      </div>
    )
  if (!session) return <Login />
  return (
    <ConfirmProvider>
      <OdDialogProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ods" element={<OdList />} />
            <Route path="/ods/new" element={<NewOd />} />
            <Route path="/ods/:id" element={<OdDetail />} />
            <Route path="/closure" element={<ClosureWizard />} />
            <Route path="/fds" element={<FdList />} />
            <Route path="/fds/:id" element={<FdDetail />} />
            <Route path="/interest" element={<BulkInterest />} />
            <Route path="/savings" element={<SavingsList />} />
            <Route path="/branches" element={<BranchList />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/import-export" element={<ImportExport />} />
            <Route path="/opening-balances" element={<OpeningBalances />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </OdDialogProvider>
    </ConfirmProvider>
  )
}

export function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Gate />
        <Toaster richColors position="top-center" closeButton />
      </AuthProvider>
    </HashRouter>
  )
}
