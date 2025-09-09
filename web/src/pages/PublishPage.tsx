
import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Label } from '../components/ui/label'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { UploadCloud } from 'lucide-react'

export function PublishPage() {
  const [title, setTitle] = React.useState('MyLoRA')
  const [desc, setDesc] = React.useState('Describe your LoRA...')
  const [tags, setTags] = React.useState('flux,lora,character,sdxl')

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle>Publish to Registry</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={e=>setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <textarea
              className="w-full min-h-[160px] rounded-md bg-muted/70 border px-3 py-2 focus-ring"
              value={desc} onChange={e=>setDesc(e.target.value)}
            />
          </div>
          <div>
            <Label>Tags (comma separated)</Label>
            <Input value={tags} onChange={e=>setTags(e.target.value)} />
          </div>
          <div className="pt-2">
            <Button><UploadCloud className="mr-2" size={16}/>Publish</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Export</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>• Export training config as JSON or script.</p>
          <p>• Upload checkpoints and metadata to your chosen registry.</p>
          <p>• This panel is a placeholder for your actual integration endpoints.</p>
        </CardContent>
      </Card>
    </div>
  )
}
