'use client';
import {Toaster} from 'sonner';
import { ThemeProvider, useThemePreference } from '@/components/theme-provider';
function ThemedToaster(){const {theme}=useThemePreference();return <Toaster theme={theme} position='top-center'/>;}
export function Providers({children}:{children:React.ReactNode}){return <ThemeProvider>{children}<ThemedToaster/></ThemeProvider>}
