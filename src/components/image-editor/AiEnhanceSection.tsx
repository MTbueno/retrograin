
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
  // Get getCanvasDataURL to fetch fresh image data for AI
  // processedImageURI is removed as input, setProcessedImageURI might be used for output if needed.
  const { dispatchSettings, originalImage, isLoadingAi, setIsLoadingAi, getCanvasDataURL, setProcessedImageURI } = useImageEditor();
  const { toast } = useToast();
  const [aiSuggestions, setAiSuggestions] = useState<SuggestEnhancementsOutput | null>(null);

  const handleAiEnhance = async () => {
    if (!originalImage) {
      toast({ title: "No Image", description: "Please upload an image first.", variant: "destructive" });
      return;
    }

    const currentImageURIForAI = getCanvasDataURL(); // Get fresh URI for AI

    if (!currentImageURIForAI) {
        toast({ title: "Processing Error", description: "Could not get current image data for AI.", variant: "destructive" });
        return;
    }

    setIsLoadingAi(true);
    setAiSuggestions(null);
    try {
      const suggestions = await suggestEnhancements({ photoDataUri: currentImageURIForAI });
      setAiSuggestions(suggestions);
      // Optionally, if applying AI suggestions should make this the new "processedImageURI" for other features:
      // setProcessedImageURI(currentImageURIForAI); // This might be redundant if applying settings redraws and download gets fresh
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
    
    const mappedSuggestions = {
        brightness: aiSuggestions.brightness / 100,
        contrast: aiSuggestions.contrast / 100,    
        saturation: aiSuggestions.saturation / 100,
        exposure: aiSuggestions.exposure / 100,     
    };

    dispatchSettings({ type: 'APPLY_AI_SUGGESTIONS', payload: mappedSuggestions });
    // After applying settings, the canvas will re-render.
    // The next call to getCanvasDataURL() for download or another AI enhance will get this updated state.
    // If we wanted to explicitly set processedImageURI for some reason:
    // const newUri = getCanvasDataURL();
    // if (newUri) setProcessedImageURI(newUri);
    toast({ title: "AI Suggestions Applied!", icon: <CheckCircle className="h-4 w-4" /> });
    setAiSuggestions(null); 
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
