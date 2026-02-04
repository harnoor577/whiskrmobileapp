import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Heart } from "lucide-react";

interface PatientInfoCardProps {
  patient: {
    name: string;
    species: string;
    breed?: string | null;
    sex?: string | null;
    date_of_birth?: string | null;
    age?: string | null;
    weight_kg?: number | null;
    weight_lb?: number | null;
    identifiers?: Record<string, string> | null;
  };
  weightUnit: 'kg' | 'lb';
  hasPassedAway?: boolean;
}

const calculateAge = (dateOfBirth: string) => {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  const years = today.getFullYear() - birth.getFullYear();
  const months = today.getMonth() - birth.getMonth();
  
  if (years === 0) {
    return `${months} month${months !== 1 ? 's' : ''}`;
  }
  return `${years} year${years !== 1 ? 's' : ''}`;
};

const toMedicalSpecies = (species: string) => {
  const lowerSpecies = species.toLowerCase();
  if (lowerSpecies === 'dog') return 'Canine';
  if (lowerSpecies === 'cat') return 'Feline';
  if (lowerSpecies === 'bird') return 'Avian';
  if (lowerSpecies === 'rabbit') return 'Lagomorph';
  if (lowerSpecies === 'horse') return 'Equine';
  if (lowerSpecies === 'cow' || lowerSpecies === 'cattle') return 'Bovine';
  if (lowerSpecies === 'pig') return 'Porcine';
  if (lowerSpecies === 'sheep') return 'Ovine';
  if (lowerSpecies === 'goat') return 'Caprine';
  return species.charAt(0).toUpperCase() + species.slice(1);
};

export function PatientInfoCard({ patient, weightUnit, hasPassedAway }: PatientInfoCardProps) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-4 md:p-6">
        <div className="space-y-4">
          {/* Patient Name & Species */}
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                {patient.name}
              </h2>
              {hasPassedAway && (
                <Badge 
                  variant="outline" 
                  className="bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800 flex items-center gap-1.5"
                >
                  <Heart className="h-4 w-4" />
                  Passed Away
                </Badge>
              )}
            </div>
            <p className="text-sm md:text-base text-muted-foreground">
              {toMedicalSpecies(patient.species)} • {patient.breed || "Mixed"}
            </p>
          </div>

          {/* Sex & Age Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Sex</p>
              <p className="text-base md:text-lg font-semibold text-foreground">
                {patient.sex || "Unknown"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Age</p>
            <p className="text-base md:text-lg font-semibold text-foreground">
                {patient.age || (patient.date_of_birth ? calculateAge(patient.date_of_birth) : "Unknown")}
              </p>
            </div>
          </div>

          {/* Weight */}
          {(patient.weight_kg || patient.weight_lb) && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Weight</p>
              <p className="text-base md:text-lg font-semibold text-foreground">
                {weightUnit === 'kg' 
                  ? `${patient.weight_kg} kg` 
                  : `${patient.weight_lb} lb`}
              </p>
            </div>
          )}

          {/* Identifiers */}
          {patient.identifiers && Object.keys(patient.identifiers).length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Identifiers</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(patient.identifiers).map(([key, value]) => (
                  <Badge key={key} variant="secondary" className="text-xs">
                    {key}: {value as string}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
