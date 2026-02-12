'use client';

import React from 'react';

interface SuggestedPromptsProps {
  prompts: string[];
  onSelect: (prompt: string) => void;
}

const SuggestedPrompts: React.FC<SuggestedPromptsProps> = ({ prompts, onSelect }) => {
  if (prompts.length === 0) return null;

  return (
    <div className='flex flex-wrap justify-center gap-1.5 px-2'>
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type='button'
          className='bg-base-200 hover:bg-base-300 text-base-content/70 hover:text-base-content rounded-full px-3 py-1.5 text-xs transition-colors'
          onClick={() => onSelect(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
};

export default SuggestedPrompts;
