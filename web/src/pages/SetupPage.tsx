import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select } from "../components/ui/select";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { Upload, ImagePlus } from "lucide-react";

export function SetupPage() {
  const [loraName, setLoraName] = React.useState("MyLoRA");
  const [trigger, setTrigger] = React.useState("");
  const [images, setImages] = React.useState<File[]>([]);
  // Captioning settings
  const [captionModel, setCaptionModel] = React.useState("qwen-7b");
  const [captionStyle, setCaptionStyle] = React.useState("brief");
  const [attention, setAttention] = React.useState("eager");
  const [maxLen, setMaxLen] = React.useState(1024);
  const [beam, setBeam] = React.useState(3);
  const [temp, setTemp] = React.useState(0.7);
  const [removePrefix, setRemovePrefix] = React.useState(true); // <-- fixed: true (JS), not True
  const [batchSize, setBatchSize] = React.useState(1);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(png|jpe?g|webp)$/i.test(f.name),
    );
    setImages((prev) => [...prev, ...files]);
  }
  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
      ? Array.from(e.target.files).filter((f) =>
          /\.(png|jpe?g|webp)$/i.test(f.name),
        )
      : [];
    setImages((prev) => [...prev, ...files]);
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>LoRA Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">LoRA Name</Label>
            <Input
              id="name"
              value={loraName}
              onChange={(e) => setLoraName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="trigger">Trigger Word/Sentence</Label>
            <Input
              id="trigger"
              placeholder="e.g., ohwx person"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
            />
          </div>

          <Separator />

          <div>
            <Label>Training Images</Label>
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="mt-2 rounded-xl border border-dashed p-6 text-center bg-muted/40"
            >
              <div className="flex flex-col items-center gap-2">
                <ImagePlus className="opacity-70" />
                <p className="text-sm opacity-80">
                  Drag & drop images here, or click to select
                </p>
                <p className="text-xs text-gray-400">
                  Supports PNG, JPG, JPEG, WebP
                </p>
                <div>
                  <label className="inline-flex items-center gap-2 mt-3 cursor-pointer px-3 py-2 rounded-md border hover:bg-muted">
                    <Upload size={16} />
                    <span>Select images</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={onSelect}
                    />
                  </label>
                </div>
              </div>
            </div>
            <p className="mt-2 text-sm text-gray-400">
              {images.length} images selected
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Florence-2 Auto-Caption Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Florence-2 Model</Label>
              <Select
                value={captionModel}
                onChange={(e) => setCaptionModel(e.target.value)}
                options={[
                  { value: "florence-small", label: "Florence-2 Small (Fast)" },
                  {
                    value: "florence-large",
                    label: "Florence-2 Large (Better quality)",
                  },
                ]}
              />
            </div>
            <div>
              <Label>Caption Style</Label>
              <Select
                value={captionStyle}
                onChange={(e) => setCaptionStyle(e.target.value)}
                options={[
                  { value: "brief", label: "Brief Caption" },
                  { value: "detailed", label: "Detailed Caption" },
                ]}
              />
            </div>
            <div>
              <Label>Attention Mode</Label>
              <Select
                value={attention}
                onChange={(e) => setAttention(e.target.value)}
                options={[
                  { value: "eager", label: "Eager - Standard (default)" },
                  { value: "chunked", label: "Chunked - Low VRAM" },
                ]}
              />
            </div>
            <div>
              <Label>Max Caption Length</Label>
              <Input
                type="number"
                value={maxLen}
                onChange={(e) => setMaxLen(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Beam Search Width</Label>
              <Input
                type="number"
                value={beam}
                onChange={(e) => setBeam(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Temperature</Label>
              <Input
                type="number"
                step="0.1"
                value={temp}
                onChange={(e) => setTemp(Number(e.target.value))}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="post">Post-processing</Label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="post"
                  type="checkbox"
                  checked={removePrefix}
                  onChange={(e) => setRemovePrefix(e.target.checked)}
                />
                <span className="text-sm">
                  Remove Prefix — strip “The image shows …”
                </span>
              </div>
            </div>
            <div>
              <Label>Batch Size</Label>
              <Select
                value={String(batchSize)}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                options={[
                  { value: "1", label: "1 - Low VRAM (safest)" },
                  { value: "2", label: "2" },
                  { value: "4", label: "4" },
                ]}
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Estimated Performance: ~4–5 sec/image • Remove Prefix:{" "}
            {removePrefix ? "on" : "off"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
