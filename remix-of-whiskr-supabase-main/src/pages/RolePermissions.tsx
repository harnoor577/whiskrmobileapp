import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function RolePermissions() {
  const permissions = [
    {
      category: "Patient Management",
      items: [
        { action: "View patients", receptionist: true, vet_tech: true, vet: true, admin: true },
        { action: "Add new patients", receptionist: true, vet_tech: true, vet: true, admin: true },
        { action: "Edit patient information", receptionist: true, vet_tech: true, vet: true, admin: true },
        { action: "Delete patients", receptionist: false, vet_tech: true, vet: true, admin: true },
      ]
    },
    {
      category: "Consult Management",
      items: [
        { action: "View consults", receptionist: true, vet_tech: true, vet: true, admin: true },
        { action: "Create new consults", receptionist: false, vet_tech: true, vet: true, admin: true },
        { action: "Edit vitals (weight)", receptionist: false, vet_tech: true, vet: true, admin: true },
        { action: "Edit physical exam", receptionist: false, vet_tech: false, vet: true, admin: true },
        { action: "Edit assessment", receptionist: false, vet_tech: false, vet: true, admin: true },
        { action: "Edit treatment plan", receptionist: false, vet_tech: false, vet: true, admin: true },
        { action: "Finalize consults", receptionist: false, vet_tech: true, vet: true, admin: true },
        { action: "Delete consults", receptionist: false, vet_tech: true, vet: true, admin: true },
      ]
    },
    {
      category: "Tasks",
      items: [
        { action: "View tasks", receptionist: true, vet_tech: true, vet: true, admin: true },
        { action: "Create tasks", receptionist: true, vet_tech: true, vet: true, admin: true },
        { action: "Edit tasks", receptionist: true, vet_tech: true, vet: true, admin: true },
        { action: "Delete tasks", receptionist: true, vet_tech: true, vet: true, admin: true },
      ]
    },
    {
      category: "Templates",
      items: [
        { action: "View templates", receptionist: true, vet_tech: true, vet: true, admin: true },
        { action: "Create templates", receptionist: false, vet_tech: true, vet: true, admin: true },
        { action: "Edit templates", receptionist: false, vet_tech: true, vet: true, admin: true },
        { action: "Delete templates", receptionist: false, vet_tech: true, vet: true, admin: true },
      ]
    },
    {
      category: "Administrative",
      items: [
        { action: "Access admin panel", receptionist: false, vet_tech: false, vet: false, admin: true },
        { action: "Manage team members", receptionist: false, vet_tech: false, vet: false, admin: true },
        { action: "Manage clinic settings", receptionist: false, vet_tech: false, vet: false, admin: true },
        { action: "Access billing", receptionist: false, vet_tech: false, vet: false, admin: true },
      ]
    }
  ];

  const roles = [
    { key: "receptionist", label: "Receptionist", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300" },
    { key: "vet_tech", label: "Vet Tech", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
    { key: "vet", label: "Vet/DVM", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
    { key: "admin", label: "Admin", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300" },
  ];

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Role Permissions Matrix</h1>
        <p className="text-muted-foreground">
          Overview of what each role can do in the system
        </p>
      </div>

      <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-blue-900 dark:text-blue-100">
          <strong>Vet Tech Restrictions:</strong> Vet technicians can only update vitals (weight) in consults. 
          Physical exam, assessment, and treatment plans require a DVM/Vet role. These restrictions are enforced at the database level.
        </AlertDescription>
      </Alert>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle>Role Types</CardTitle>
          <CardDescription>Different roles have different access levels</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {roles.map(role => (
              <Badge key={role.key} variant="outline" className={role.color}>
                {role.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Permissions by Category */}
      {permissions.map((category) => (
        <Card key={category.category}>
          <CardHeader>
            <CardTitle>{category.category}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Action</th>
                    {roles.map(role => (
                      <th key={role.key} className="text-center py-3 px-4">
                        <Badge variant="outline" className={`${role.color} text-xs`}>
                          {role.label}
                        </Badge>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {category.items.map((item, idx) => (
                    <tr key={idx} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium">{item.action}</td>
                      {roles.map(role => (
                        <td key={role.key} className="text-center py-3 px-4">
                          {item[role.key as keyof typeof item] ? (
                            <Check className="h-5 w-5 text-green-600 dark:text-green-400 mx-auto" />
                          ) : (
                            <X className="h-5 w-5 text-red-500 dark:text-red-400 mx-auto" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Additional Notes */}
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
        <CardHeader>
          <CardTitle className="text-amber-900 dark:text-amber-100">Important Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-amber-900 dark:text-amber-100 space-y-2">
          <p>
            <strong>Vet Tech Limitations:</strong> When a vet tech attempts to edit physical exam findings, 
            assessment, or treatment plans in a consult, the system will prevent the update and show an error message.
          </p>
          <p>
            <strong>Admin Role:</strong> The admin role has full access to all features plus additional 
            administrative capabilities like billing, team management, and clinic settings.
          </p>
          <p>
            <strong>Receptionist Role:</strong> Receptionists have view-only access to consults but can 
            fully manage patients and tasks to support front desk operations.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
