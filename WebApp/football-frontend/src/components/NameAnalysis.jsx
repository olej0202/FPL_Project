// File: src/components/NameModal.jsx
import React, { useState } from "react";

export default function NameModal({  
  isOpen,  
  onConfirm,  
  onCancel,  
  title = "Name your analysis"  
}) {  
  const [value, setValue] = useState("");  

  if (!isOpen) return null;  

  return (  
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">  
      <div className="bg-royal-beige p-6 rounded-lg shadow-lg w-80">  
        <h2 className="text-xl font-semibold mb-4 text-black">{title}</h2>  
        <input
  type="text"
  className="w-full p-2 mb-4 border border-royal-gold rounded bg-white text-black placeholder-gray-500"
  placeholder="Enter name…"
  value={value}
  onChange={(e) => setValue(e.target.value)}
/> 
        <div className="flex justify-end gap-2">  
          <button  
            className="px-4 py-2 bg-gray-300 text-black rounded hover:bg-gray-400"  
            onClick={() => { setValue(""); onCancel(); }}  
          >  
            Cancel  
          </button>  
          <button  
            className="px-4 py-2 bg-royal-gold text-black rounded hover:bg-yellow-400 disabled:opacity-50"  
            disabled={!value.trim()}  
            onClick={() => { onConfirm(value.trim()); setValue(""); }}  
          >  
            OK  
          </button>  
        </div>  
      </div>  
    </div>  
  );  
}
