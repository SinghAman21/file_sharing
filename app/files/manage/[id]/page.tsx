'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Shield, AlertTriangle, Edit, Eye, Trash2, Download, Plus, FileText, Archive, Users, Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';

interface Subfile {
  file_name: string;
  file_path: string;
  size: number;
  mime_type: string;
  file_token: string;
  extracted: boolean;
  downloaded_at: string | null;
}

interface FileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadDate: string;
  downloadCount: number;
  maxDownloads: number;
  expiryDate: string;
  isPasswordProtected: boolean;
  virusScanStatus: string;
  files: Subfile[];
  appwrite_id: string;
  isActive: boolean;
}

interface AccessLog {
  id: string;
  ip: string;
  timestamp: Date;
  action: 'download' | 'view';
  userAgent: string;
}

export default function ManageFilePage() {
  const params = useParams();
  const router = useRouter();
  const [editToken, setEditToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [filesToDelete, setFilesToDelete] = useState<string[]>([]); // file_token of files to delete
  const [updateLoading, setUpdateLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileId = params.id as string;

  // Fetch metadata from API
  const loadFileData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/files/metadata/${fileId}`);
      if (!res.ok) {
        setError('File not found or has been deleted.');
        setFileInfo(null);
      } else {
        const data = await res.json();
        setFileInfo(data);
      }
    } catch (e) {
      setError('Failed to fetch file metadata.');
      setFileInfo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadFileData();
    }
    // eslint-disable-next-line
  }, [isAuthenticated, fileId]);

  const handleAuthenticate = () => {
    // Simulate token verification (replace with real check if needed)
    if (editToken && editToken.length >= 10) {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Invalid edit token.');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString();
  };

  const handleDeleteFile = (fileId: string) => {
    if (fileInfo?.files) {
      setFileInfo({
        ...fileInfo,
        files: fileInfo.files.filter(f => f.file_token !== fileId)
      });
    }
  };

  // Handler for adding files to pendingFiles
  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files ?? []); // Fix linter error
    setPendingFiles(prev => [...prev, ...filesArray]);
    e.target.value = '';
  };

  // Handler for removing a pending file
  const handleRemovePendingFile = (idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // Handler for marking an existing file for deletion
  const handleDeleteExistingFile = (fileToken: string) => {
    setFilesToDelete(prev => [...prev, fileToken]);
  };

  // Handler for undoing delete on an existing file
  const handleUndoDeleteExistingFile = (fileToken: string) => {
    setFilesToDelete(prev => prev.filter(token => token !== fileToken));
  };

  // Handler for updating files (send to backend)
  const handleUpdateFiles = async () => {
    if (pendingFiles.length === 0 && filesToDelete.length === 0) return;
    setUpdateLoading(true);
    setError('');
    try {
      const formData = new FormData();
      pendingFiles.forEach(file => {
        formData.append('files', file);
        formData.append('relativePaths', (file as any).webkitRelativePath || file.name);
      });
      formData.append('editToken', editToken);
      // Send files to delete as a JSON string
      formData.append('filesToDelete', JSON.stringify(filesToDelete));
      const res = await fetch(`/api/files/manage/${fileId}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update file');
      } else {
        await loadFileData();
        setPendingFiles([]);
        setFilesToDelete([]);
      }
    } catch (err) {
      setError('Failed to update file');
    } finally {
      setUpdateLoading(false);
    }
  };

  const viewAsReceiver = () => {
    router.push(`/files/${fileId}`);
  };

  // Handler for uploading a new ZIP file
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const zipFile = e.target.files[0];
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', zipFile);
      formData.append('editToken', editToken);
      const res = await fetch(`/api/files/manage/${fileId}`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update file');
      } else {
        await loadFileData();
      }
    } catch (err) {
      setError('Failed to update file');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border/40 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/">
              <Button variant="ghost" size="sm" className="hover:bg-accent/50">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <div className="container mx-auto px-4 py-8 max-w-md">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Edit className="h-5 w-5 mr-2" />
                Enter Edit Token
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token">Management Token</Label>
                <Input
                  id="token"
                  type="password"
                  placeholder="Enter your edit token"
                  value={editToken}
                  onChange={(e) => setEditToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAuthenticate()}
                  className="bg-background/50"
                />
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </div>
              <Button 
                onClick={handleAuthenticate} 
                disabled={!editToken} 
                className="w-full hover:scale-105 transition-transform"
              >
                Access File Management
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg text-muted-foreground">Loading file info...</div>
      </div>
    );
  }

  if (!fileInfo) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border/40 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/">
              <Button variant="ghost" size="sm" className="hover:bg-accent/50">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <div className="container mx-auto px-4 py-8 max-w-md">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center text-destructive">
                <AlertTriangle className="h-5 w-5 mr-2" />
                File Not Found
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                This file doesn't exist or has been deleted.
              </p>
              <Link href="/files">
                <Button className="w-full">
                  Upload New File
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm" className="hover:bg-accent/50">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <div className="flex items-center space-x-2">
            <Button 
              onClick={viewAsReceiver}
              variant="outline" 
              size="sm" 
              className="hover:scale-105 transition-transform"
            >
              <Eye className="h-4 w-4 mr-2" />
              View as Receiver
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* File Header */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Archive className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">{fileInfo.name}</CardTitle>
                    <p className="text-muted-foreground">
                      {formatFileSize(fileInfo.size)} • Uploaded {new Date(fileInfo.uploadDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col items-end space-y-2">
                  <Badge variant={fileInfo.virusScanStatus === 'clean' ? 'default' : 'destructive'}>
                    <Shield className="h-3 w-3 mr-1" />
                    {fileInfo.virusScanStatus === 'clean' ? 'Virus Free' : 'Infected'}
                  </Badge>
                  {fileInfo.isPasswordProtected && (
                    <Badge variant="secondary">
                      Protected
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {fileInfo.downloadCount}
                  </div>
                  <p className="text-sm text-muted-foreground">Total Downloads</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card/50 border-border/50">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-chart-1">
                    {fileInfo.maxDownloads - fileInfo.downloadCount}
                  </div>
                  <p className="text-sm text-muted-foreground">Downloads Remaining</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-card/50 border-border/50">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-chart-2">
                    {Math.ceil((new Date(fileInfo.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}
                  </div>
                  <p className="text-sm text-muted-foreground">Days Until Expiry</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Management Tabs */}
          <Tabs defaultValue="files" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-muted/50">
              <TabsTrigger value="files">File Management</TabsTrigger>
              <TabsTrigger value="logs">Access Logs</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="files" className="space-y-4">
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center">
                      <Archive className="h-5 w-5 mr-2" />
                      Archive Contents ({fileInfo.files?.length || 0} files)
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        multiple
                        ref={fileInputRef}
                        accept="*"
                        onChange={handleAddFiles}
                        disabled={updateLoading}
                        style={{ display: 'none' }}
                        id="add-files-input"
                      />
                      <label htmlFor="add-files-input">
                        <Button size="sm" className="hover:scale-105 transition-transform" asChild>
                          <span>Add Files</span>
                        </Button>
                      </label>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-2">
                      {/* Existing files from metadata */}
                      {fileInfo.files?.map((file) => {
                        const isMarkedForDelete = filesToDelete.includes(file.file_token);
                        return (
                          <div key={file.file_token} className={`flex items-center justify-between py-2 px-3 rounded-lg ${isMarkedForDelete ? 'bg-red-100' : 'bg-muted/30'}`}>
                            <div className="flex items-center space-x-2">
                              <FileText className={`h-4 w-4 ${isMarkedForDelete ? 'text-red-600' : 'text-muted-foreground'}`} />
                              <span className={`text-sm font-medium ${isMarkedForDelete ? 'line-through text-red-600' : ''}`}>{file.file_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatFileSize(file.size)}
                              </span>
                            </div>
                            {isMarkedForDelete ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUndoDeleteExistingFile(file.file_token)}
                                className="text-green-600 hover:text-green-800"
                              >
                                Undo
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteExistingFile(file.file_token)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                      {/* Pending files to be added */}
                      {pendingFiles.map((file, idx) => (
                        <div key={file.name + file.size + idx} className="flex items-center justify-between py-2 px-3 bg-yellow-50 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4 text-yellow-600" />
                            <span className="text-sm font-medium">{file.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatFileSize(file.size)}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemovePendingFile(idx)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
                  <Button
                    onClick={handleUpdateFiles}
                    className="w-full mt-4"
                    disabled={pendingFiles.length === 0 && filesToDelete.length === 0 || updateLoading}
                  >
                    {updateLoading ? 'Updating...' : 'Update Archive'}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="logs" className="space-y-4">
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Users className="h-5 w-5 mr-2" />
                    Access Logs ({accessLogs.length} entries)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-2">
                      {accessLogs.map((log) => (
                        <div key={log.id} className="flex items-center justify-between py-3 px-3 bg-muted/30 rounded-lg">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <Badge variant={log.action === 'download' ? 'default' : 'secondary'}>
                                {log.action === 'download' ? <Download className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                                {log.action}
                              </Badge>
                              <span className="text-sm font-medium">{log.ip}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(log.timestamp)}
                            </p>
                          </div>
                          <div className="text-xs text-muted-foreground max-w-xs truncate">
                            {log.userAgent}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4">
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Shield className="h-5 w-5 mr-2" />
                    File Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Password Protection</p>
                      <p className="text-sm text-muted-foreground">Require password for downloads</p>
                    </div>
                    <Badge variant={fileInfo.isPasswordProtected ? 'default' : 'secondary'}>
                      {fileInfo.isPasswordProtected ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Download Limit</p>
                      <p className="text-sm text-muted-foreground">Maximum number of downloads</p>
                    </div>
                    <span className="text-sm font-medium">{fileInfo.maxDownloads}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Expiry Date</p>
                      <p className="text-sm text-muted-foreground">Automatic deletion date</p>
                    </div>
                    <span className="text-sm font-medium">{new Date(fileInfo.expiryDate).toLocaleDateString()}</span>
                  </div>
                  
                  <div className="pt-4 border-t border-border/50">
                    <Button variant="destructive" className="w-full hover:scale-105 transition-transform">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete File Permanently
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}