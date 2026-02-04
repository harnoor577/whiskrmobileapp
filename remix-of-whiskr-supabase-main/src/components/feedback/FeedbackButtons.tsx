import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface FeedbackButtonsProps {
  contentType: 'diagnosis' | 'treatment_plan' | 'soap_note';
  contentText: string;
  consultId?: string;
}

export function FeedbackButtons({ contentType, contentText, consultId }: FeedbackButtonsProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'positive' | 'negative'>('positive');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { clinicId, user } = useAuth();
  const { toast } = useToast();

  const handleFeedbackClick = (type: 'positive' | 'negative') => {
    setFeedbackType(type);
    setShowDialog(true);
  };

  const submitFeedback = async (type: 'positive' | 'negative', text: string) => {
    if (!clinicId || !user) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('ai_feedback').insert({
        clinic_id: clinicId,
        consult_id: consultId,
        user_id: user.id,
        content_type: contentType,
        content_text: contentText,
        feedback_type: type,
        feedback_text: text || null,
      });

      if (error) throw error;

      toast({
        title: "Thank you for your feedback!",
        description: "Your feedback helps us improve our AI assistance.",
      });

      setShowDialog(false);
      setFeedbackText('');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleFeedbackClick('positive')}
          className="hover:bg-green-50 dark:hover:bg-green-950"
        >
          <ThumbsUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleFeedbackClick('negative')}
          className="hover:bg-red-50 dark:hover:bg-red-950"
        >
          <ThumbsDown className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Send Feedback</DialogTitle>
            <DialogDescription>
              Share more and help us improve
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Textarea
              placeholder="Please avoid personal health information."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="min-h-[120px]"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => submitFeedback(feedbackType, feedbackText)}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}