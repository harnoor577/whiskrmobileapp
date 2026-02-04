import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface DuplicateResult {
  clinic_id: string;
  patient_id: string;
  duplicate_count: number;
  patient_ids: string[];
}

export function DuplicatePatientChecker() {
  const [checking, setChecking] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateResult[]>([]);
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});

  const checkDuplicates = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.rpc('find_duplicate_patient_ids');
      
      if (error) throw error;
      
      setDuplicates(data || []);
      
      // Fetch clinic names for the results
      if (data && data.length > 0) {
        const clinicIds = [...new Set(data.map((d: any) => d.clinic_id))];
        const { data: clinics } = await supabase
          .from('clinics')
          .select('id, name')
          .in('id', clinicIds);
        
        if (clinics) {
          const names: Record<string, string> = {};
          clinics.forEach((c: any) => {
            names[c.id] = c.name;
          });
          setClinicNames(names);
        }
      }
      
      if (!data || data.length === 0) {
        toast.success('No duplicate patient IDs found');
      } else {
        toast.warning(`Found ${data.length} duplicate patient ID(s)`);
      }
    } catch (error: any) {
      console.error('Error checking duplicates:', error);
      toast.error(error.message || 'Failed to check for duplicates');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Duplicate Patient ID Checker</CardTitle>
        <CardDescription>
          Scan the database for duplicate patient IDs within clinics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={checkDuplicates} 
          disabled={checking}
          className="w-full"
        >
          {checking ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Check for Duplicates
            </>
          )}
        </Button>

        {!checking && duplicates.length === 0 && (
          <Alert>
            <Check className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700">
              Click the button above to scan for duplicate patient IDs
            </AlertDescription>
          </Alert>
        )}

        {!checking && duplicates.length > 0 && (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Found {duplicates.length} duplicate patient ID(s) that need attention
              </AlertDescription>
            </Alert>

            {duplicates.map((dup, index) => (
              <Card key={index} className="border-destructive">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      Patient ID: {dup.patient_id}
                    </CardTitle>
                    <Badge variant="destructive">
                      {dup.duplicate_count} duplicates
                    </Badge>
                  </div>
                  <CardDescription>
                    Clinic: {clinicNames[dup.clinic_id] || 'Loading...'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Affected Patient UUIDs:</p>
                    <div className="space-y-1">
                      {dup.patient_ids.map((id) => (
                        <div
                          key={id}
                          className="text-xs font-mono bg-muted p-2 rounded"
                        >
                          {id}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      These patients share the same patient ID. Please review and update them manually.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}