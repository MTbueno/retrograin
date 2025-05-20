"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sparkles, CheckCircle } from 'lucide-react';
import { suggestEnhancements, type SuggestEnhancementsOutput } from '@/ai/flows/suggest-enhancements';
import { useToast } from '@/hooks/use-toast';
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function AiEnhanceSection() {
  const { dispatchSettings, originalImage, processedImageURI, isLoadingAi, setIsLoadingAi } = useImageEditor();
  const { toast } = useToast();
  const [aiSuggestions, setAiSuggestions] = useState<SuggestEnhancementsOutput | null>(null);

  const handleAiEnhance = async () => {
    if (!originalImage) {
      toast({ title: "No Image", description: "Please upload an image first.", variant: "destructive" });
      return;
    }
    if (!processedImageURI) {
        toast({ title: "Processing Error", description: "Could not get current image data for AI.", variant: "destructive" });
        return;
    }

    setIsLoadingAi(true);
    setAiSuggestions(null);
    try {
      const suggestions = await suggestEnhancements({ photoDataUri: processedImageURI });
      setAiSuggestions(suggestions);
      toast({ title: "AI Suggestions Ready!", description: "Review and apply the suggestions below." });
    } catch (error) {
      console.error("AI Enhancement Error:", error);
      toast({ title: "AI Error", description: "Could not get AI suggestions.", variant: "destructive" });
    } finally {
      setIsLoadingAi(false);
    }
  };

  const applyAiSuggestions = () => {
    if (!aiSuggestions) return;
    
    // Map AI suggestions to our internal settings scale
    // Assuming AI returns values like 0-200 for brightness/contrast/saturation and -100 to 100 for exposure
    const mappedSuggestions = {
        brightness: aiSuggestions.brightness / 100, // e.g. 120 -> 1.2
        contrast: aiSuggestions.contrast / 100,     // e.g. 80 -> 0.8
        saturation: aiSuggestions.saturation / 100, // e.g. 150 -> 1.5
        exposure: aiSuggestions.exposure / 100,     // e.g. 20 -> 0.2, -10 -> -0.1
    };

    dispatchSettings({ type: 'APPLY_AI_SUGGESTIONS', payload: mappedSuggestions });
    toast({ title: "AI Suggestions Applied!", icon: <CheckCircle className="h-4 w-4" /> });
    setAiSuggestions(null); // Clear suggestions after applying
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium block mb-2">AI Smart Enhancement</Label>
      <Button onClick={handleAiEnhance} disabled={!originalImage || isLoadingAi} className="w-full">
        <Sparkles className="mr-2 h-4 w-4" />
        {isLoadingAi ? 'Analyzing...' : 'Suggest Enhancements'}
      </Button>

      {aiSuggestions && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">AI Suggestions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Brightness: {aiSuggestions.brightness.toFixed(0)}</p>
            <p>Contrast: {aiSuggestions.contrast.toFixed(0)}</p>
            <p>Saturation: {aiSuggestions.saturation.toFixed(0)}</p>
            <p>Exposure: {aiSuggestions.exposure.toFixed(0)}</p>
            <Button onClick={applyAiSuggestions} className="w-full mt-2" size="sm">
              Apply Suggestions
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
