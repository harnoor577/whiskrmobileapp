import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Library, FileText } from 'lucide-react';
import { MyTemplatesTab } from '@/components/templates/MyTemplatesTab';
import { LibraryTab } from '@/components/templates/LibraryTab';

export default function Templates() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Templates</h1>
        <p className="text-muted-foreground">
          Customize your consultation and document templates
        </p>
      </div>

      <Tabs defaultValue="my-templates" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="my-templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            My Templates
          </TabsTrigger>
          <TabsTrigger value="library" className="flex items-center gap-2">
            <Library className="h-4 w-4" />
            Library
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-templates" className="mt-6">
          <MyTemplatesTab />
        </TabsContent>

        <TabsContent value="library" className="mt-6">
          <LibraryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
