import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { systemTemplates, SystemTemplate, TemplateSection } from '@/data/systemTemplates';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';

export interface UserTemplateSection extends TemplateSection {
  enabled: boolean;
}

export interface UserTemplate {
  id: string;
  user_id: string;
  clinic_id: string;
  system_template_id: string;
  type: 'soap' | 'wellness' | 'procedure';
  name: string;
  sections: UserTemplateSection[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Helper to safely parse sections from JSONB
function parseSections(sections: Json): UserTemplateSection[] {
  if (Array.isArray(sections)) {
    return sections as unknown as UserTemplateSection[];
  }
  return [];
}

export function useUserTemplates() {
  const { user, clinicId } = useAuth();
  const queryClient = useQueryClient();

  const { data: userTemplates, isLoading, refetch } = useQuery({
    queryKey: ['user-templates', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('user_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('type', { ascending: true });

      if (error) throw error;

      // Parse sections from JSONB
      return (data || []).map(template => ({
        ...template,
        sections: parseSections(template.sections),
        type: template.type as 'soap' | 'wellness' | 'procedure',
      })) as UserTemplate[];
    },
    enabled: !!user?.id,
  });

  // Initialize user templates from system templates if none exist
  const initializeTemplates = useMutation({
    mutationFn: async () => {
      if (!user?.id || !clinicId) throw new Error('User not authenticated');

      const templatesWithSections = systemTemplates.map(st => ({
        user_id: user.id,
        clinic_id: clinicId,
        system_template_id: st.id,
        type: st.type,
        name: st.name,
        sections: st.sections.map(s => ({ ...s, enabled: true })),
        is_active: true, // All templates active by default
      }));

      const { error } = await supabase
        .from('user_templates')
        .insert(templatesWithSections);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
    },
    onError: (error) => {
      console.error('Failed to initialize templates:', error);
      toast.error('Failed to initialize templates');
    },
  });

  // Add a system template to user templates
  const addTemplate = useMutation({
    mutationFn: async (systemTemplate: SystemTemplate) => {
      if (!user?.id || !clinicId) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('user_templates')
        .insert({
          user_id: user.id,
          clinic_id: clinicId,
          system_template_id: systemTemplate.id,
          type: systemTemplate.type,
          name: systemTemplate.name,
          sections: systemTemplate.sections.map(s => ({ ...s, enabled: true })),
          is_active: false,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
      toast.success('Template added to My Templates');
    },
    onError: (error) => {
      console.error('Failed to add template:', error);
      toast.error('Failed to add template');
    },
  });

  // Update template sections
  const updateTemplate = useMutation({
    mutationFn: async ({ id, sections, name }: { id: string; sections: UserTemplateSection[]; name?: string }) => {
      const updateData: Record<string, unknown> = { sections };
      if (name) updateData.name = name;

      const { error } = await supabase
        .from('user_templates')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
      toast.success('Template updated');
    },
    onError: (error) => {
      console.error('Failed to update template:', error);
      toast.error('Failed to update template');
    },
  });

  // Set template as active (deactivate others of same type)
  const setActiveTemplate = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: string }) => {
      if (!user?.id) throw new Error('User not authenticated');

      // First deactivate all templates of this type
      await supabase
        .from('user_templates')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('type', type);

      // Then activate the selected one
      const { error } = await supabase
        .from('user_templates')
        .update({ is_active: true })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
      toast.success('Template set as active');
    },
    onError: (error) => {
      console.error('Failed to set active template:', error);
      toast.error('Failed to set active template');
    },
  });

  // Reset template to system default
  const resetTemplate = useMutation({
    mutationFn: async (template: UserTemplate) => {
      const systemTemplate = systemTemplates.find(st => st.id === template.system_template_id);
      if (!systemTemplate) throw new Error('System template not found');

      const { error } = await supabase
        .from('user_templates')
        .update({
          sections: systemTemplate.sections.map(s => ({ ...s, enabled: true })),
          name: systemTemplate.name,
        })
        .eq('id', template.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
      toast.success('Template reset to default');
    },
    onError: (error) => {
      console.error('Failed to reset template:', error);
      toast.error('Failed to reset template');
    },
  });

  // Delete a user template
  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-templates'] });
      toast.success('Template removed');
    },
    onError: (error) => {
      console.error('Failed to delete template:', error);
      toast.error('Failed to delete template');
    },
  });

  // Get active template for a specific type
  const getActiveTemplate = (type: 'soap' | 'wellness' | 'procedure') => {
    return userTemplates?.find(t => t.type === type && t.is_active) || null;
  };

  // Check if a system template is already added
  const isTemplateAdded = (systemTemplateId: string) => {
    return userTemplates?.some(t => t.system_template_id === systemTemplateId) || false;
  };

  return {
    userTemplates: userTemplates || [],
    isLoading,
    refetch,
    initializeTemplates,
    addTemplate,
    updateTemplate,
    setActiveTemplate,
    resetTemplate,
    deleteTemplate,
    getActiveTemplate,
    isTemplateAdded,
  };
}
