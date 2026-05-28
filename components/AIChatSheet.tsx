import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView,
  KeyboardAvoidingView, Platform, Keyboard, Animated, ActivityIndicator, Alert,
} from 'react-native';
import { scale } from '../lib/scale';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPromptTemplates, createPromptTemplate, updatePromptTemplate, deletePromptTemplate } from '../lib/database';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Detect a trailing block of `[label] [label] ...` patterns in an
 * assistant message and split it into prose + button labels. The
 * AI writes choices this way naturally per the RAG (see
 * `notify_prompt.md`, `create_weekly_sequential.md` etc.). We
 * require at least 2 brackets at the very end of the message so
 * stray references like "حالة: [active]" or "P1 [SL]" inside a
 * normal answer don't get misread as buttons.
 */
function parseChoices(content: string): { text: string; choices: string[] } {
  const trimmed = content.trimEnd();
  const tailMatch = trimmed.match(/((?:\[[^\[\]\n]+\][ \t]*\n?[ \t]*)+)\s*$/);
  if (!tailMatch) return { text: content, choices: [] };

  const tail = tailMatch[1];
  const choices = Array.from(tail.matchAll(/\[([^\[\]\n]+)\]/g)).map((m) => m[1].trim());
  if (choices.length < 2) return { text: content, choices: [] };

  const text = trimmed.slice(0, trimmed.length - tailMatch[0].length).trimEnd();
  return { text, choices };
}

export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
}

interface AIChatSheetProps {
  visible: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  isLoading?: boolean;
  contextLabel?: string;
  clinicId?: string | null;
}

export function AIChatSheet({ visible, onClose, messages, onSend, isLoading = false, contextLabel, clinicId }: AIChatSheetProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Templates
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplatePrompt, setNewTemplatePrompt] = useState('');
  const [activeTemplate, setActiveTemplate] = useState<PromptTemplate | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  // Load templates
  useEffect(() => {
    if (visible && clinicId) {
      loadTemplates();
    }
  }, [visible, clinicId]);

  const loadTemplates = async () => {
    if (!clinicId) return;
    const { data } = await getPromptTemplates(clinicId);
    if (data) setTemplates(data);
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplatePrompt.trim() || !clinicId) return;
    if (editingTemplateId) {
      await updatePromptTemplate(editingTemplateId, newTemplateName.trim(), newTemplatePrompt.trim());
      setEditingTemplateId(null);
    } else {
      await createPromptTemplate(clinicId, newTemplateName.trim(), newTemplatePrompt.trim());
    }
    setNewTemplateName('');
    setNewTemplatePrompt('');
    setShowNewTemplate(false);
    await loadTemplates();
  };

  const handleDeleteTemplate = (t: PromptTemplate) => {
    Alert.alert('Delete Template', `Delete "${t.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deletePromptTemplate(t.id);
        if (activeTemplate?.id === t.id) setActiveTemplate(null);
        await loadTemplates();
      }},
    ]);
  };

  const handleSelectTemplate = (t: PromptTemplate) => {
    setActiveTemplate(t);
    setShowTemplates(false);
    // Put template in input field for review/edit before sending
    setInput(`[Rules]: ${t.prompt}`);
  };

  const handleEditTemplate = (t: PromptTemplate) => {
    setShowTemplates(false);
    setNewTemplateName(t.name);
    setNewTemplatePrompt(t.prompt);
    setEditingTemplateId(t.id);
    setShowNewTemplate(true);
  };

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 12 }).start();
      // Scroll to bottom when opening
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 200);
    } else {
      slideAnim.setValue(0);
    }
  }, [visible]);

  useEffect(() => {
    // Scroll to bottom on new messages
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  // Scroll to bottom when keyboard opens
  useEffect(() => {
    const keyboardShow = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => keyboardShow.remove();
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    Keyboard.dismiss();
    onSend(text);
  };

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  return (
    <>
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}>
        {/* Tap backdrop to close */}
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ height: '15%' }} />

        <View style={{
          flex: 1,
          backgroundColor: 'rgba(20, 16, 40, 0.95)',
          borderTopLeftRadius: scale(24),
          borderTopRightRadius: scale(24),
          borderTopWidth: scale(2),
          borderLeftWidth: scale(1),
          borderRightWidth: scale(1),
          borderColor: 'rgba(139,92,246,0.3)',
          overflow: 'hidden',
        }}>
          <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
            {/* Header */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: scale(16),
              paddingVertical: scale(12),
              borderBottomWidth: scale(1),
              borderBottomColor: 'rgba(255,255,255,0.08)',
            }}>
              {/* Drag handle */}
              <View style={{
                position: 'absolute',
                top: scale(6),
                left: '50%',
                marginLeft: -scale(20),
                width: scale(40),
                height: scale(4),
                borderRadius: scale(2),
                backgroundColor: 'rgba(255,255,255,0.15)',
              }} />

              {/* Orb icon */}
              <View style={{
                width: scale(32),
                height: scale(32),
                borderRadius: scale(16),
                backgroundColor: 'rgba(139,92,246,0.3)',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: scale(10),
              }}>
                <View style={{
                  width: scale(18),
                  height: scale(18),
                  borderRadius: scale(9),
                  backgroundColor: 'rgba(139,92,246,0.7)',
                  shadowColor: '#8B5CF6',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.5,
                  shadowRadius: scale(6),
                }}>
                  <View style={{
                    width: scale(8),
                    height: scale(8),
                    borderRadius: scale(4),
                    backgroundColor: 'rgba(255,255,255,0.4)',
                    position: 'absolute',
                    top: scale(3),
                    left: scale(4),
                  }} />
                </View>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: scale(15), fontWeight: '700', color: '#E8DEFF' }}>
                  D.C.M Assistant
                </Text>
                {contextLabel && (
                  <Text style={{ fontSize: scale(10), fontWeight: '500', color: 'rgba(200,180,255,0.5)', marginTop: scale(1) }}>
                    {contextLabel}
                  </Text>
                )}
              </View>

              {/* Template selector button */}
              <TouchableOpacity onPress={() => setShowTemplates(true)} style={{
                width: scale(32),
                height: scale(32),
                borderRadius: scale(16),
                backgroundColor: activeTemplate ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: scale(8),
                borderWidth: activeTemplate ? scale(1.5) : 0,
                borderColor: 'rgba(139,92,246,0.5)',
              }}>
                <Ionicons name="document-text-outline" size={scale(16)} color={activeTemplate ? '#E8DEFF' : 'rgba(255,255,255,0.5)'} />
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} style={{
                width: scale(32),
                height: scale(32),
                borderRadius: scale(16),
                backgroundColor: 'rgba(255,255,255,0.06)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Ionicons name="chevron-down" size={scale(20)} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>

            {/* Active template indicator */}
            {activeTemplate && (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: scale(16),
                paddingVertical: scale(6),
                backgroundColor: 'rgba(139,92,246,0.1)',
                borderBottomWidth: scale(1),
                borderBottomColor: 'rgba(255,255,255,0.05)',
              }}>
                <Ionicons name="document-text" size={scale(12)} color="rgba(139,92,246,0.6)" />
                <Text style={{ fontSize: scale(10), fontWeight: '600', color: 'rgba(200,180,255,0.5)', marginLeft: scale(6), flex: 1 }}>
                  {activeTemplate.name}
                </Text>
                <TouchableOpacity onPress={() => setActiveTemplate(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={scale(14)} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              </View>
            )}

            {/* Messages */}
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: scale(16), paddingBottom: scale(8) }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {messages.length === 0 && (
                <View style={{ alignItems: 'center', paddingTop: scale(40) }}>
                  {/* Orb illustration */}
                  <View style={{
                    width: scale(60),
                    height: scale(60),
                    borderRadius: scale(30),
                    backgroundColor: 'rgba(139,92,246,0.15)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: scale(16),
                  }}>
                    <View style={{
                      width: scale(34),
                      height: scale(34),
                      borderRadius: scale(17),
                      backgroundColor: 'rgba(139,92,246,0.4)',
                      shadowColor: '#8B5CF6',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.6,
                      shadowRadius: scale(10),
                    }} />
                  </View>
                  <Text style={{ fontSize: scale(16), fontWeight: '700', color: '#E8DEFF', marginBottom: scale(6) }}>
                    How can I help?
                  </Text>
                  <Text style={{ fontSize: scale(12), color: 'rgba(200,180,255,0.4)', textAlign: 'center', lineHeight: scale(18) }}>
                    Ask me anything about the schedule,{'\n'}doctors, or clinic management.
                  </Text>
                </View>
              )}

              {messages.map((msg, idx) => {
                const isLast = idx === messages.length - 1;
                // Only the last assistant message gets clickable
                // buttons. Once the user replies (a user message
                // becomes the new last entry), the buttons
                // disappear naturally so the user can't double-tap
                // a stale choice.
                const { text, choices } = msg.role === 'assistant' && isLast && !isLoading
                  ? parseChoices(msg.content)
                  : { text: msg.content, choices: [] as string[] };

                return (
                  <View key={msg.id} style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    marginBottom: scale(10),
                  }}>
                    <View style={{
                      paddingHorizontal: scale(14),
                      paddingVertical: scale(10),
                      borderRadius: scale(16),
                      backgroundColor: msg.role === 'user'
                        ? 'rgba(139,92,246,0.35)'
                        : 'rgba(255,255,255,0.06)',
                      borderWidth: scale(1),
                      borderColor: msg.role === 'user'
                        ? 'rgba(139,92,246,0.3)'
                        : 'rgba(255,255,255,0.08)',
                      borderBottomRightRadius: msg.role === 'user' ? scale(4) : scale(16),
                      borderBottomLeftRadius: msg.role === 'user' ? scale(16) : scale(4),
                    }}>
                      <Text style={{
                        fontSize: scale(13),
                        fontWeight: '500',
                        color: msg.role === 'user' ? '#E8DEFF' : 'rgba(255,255,255,0.85)',
                        lineHeight: scale(19),
                        textAlign: 'left',
                      }}>{text}</Text>
                    </View>

                    {choices.length > 0 && (
                      <View style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: scale(6),
                        marginTop: scale(8),
                        marginLeft: scale(2),
                      }}>
                        {choices.map((choice, i) => (
                          <TouchableOpacity
                            key={`${msg.id}-choice-${i}`}
                            onPress={() => onSend(choice)}
                            activeOpacity={0.7}
                            style={{
                              paddingHorizontal: scale(12),
                              paddingVertical: scale(7),
                              borderRadius: scale(14),
                              backgroundColor: 'rgba(139,92,246,0.18)',
                              borderWidth: scale(1),
                              borderColor: 'rgba(139,92,246,0.45)',
                            }}
                          >
                            <Text style={{
                              fontSize: scale(12),
                              fontWeight: '600',
                              color: '#E8DEFF',
                            }}>{choice}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Loading indicator */}
              {isLoading && (
                <View style={{
                  alignSelf: 'flex-start',
                  maxWidth: '60%',
                  marginBottom: scale(10),
                }}>
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: scale(14),
                    paddingVertical: scale(12),
                    borderRadius: scale(16),
                    borderBottomLeftRadius: scale(4),
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: scale(1),
                    borderColor: 'rgba(255,255,255,0.08)',
                    gap: scale(8),
                  }}>
                    <ActivityIndicator size="small" color="#8B5CF6" />
                    <Text style={{ fontSize: scale(12), color: 'rgba(200,180,255,0.5)' }}>Thinking...</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Input */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                paddingHorizontal: scale(12),
                paddingVertical: scale(10),
                borderTopWidth: scale(1),
                borderTopColor: 'rgba(255,255,255,0.06)',
                gap: scale(8),
              }}>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="Type a message..."
                  placeholderTextColor="rgba(200,180,255,0.3)"
                  multiline
                  maxLength={2000}
                  style={{
                    flex: 1,
                    maxHeight: scale(100),
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderRadius: scale(20),
                    paddingHorizontal: scale(16),
                    paddingVertical: scale(10),
                    fontSize: scale(14),
                    color: 'rgba(255,255,255,0.9)',
                    borderWidth: scale(1),
                    borderColor: 'rgba(139,92,246,0.15)',
                  }}
                />
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={!input.trim() || isLoading}
                  style={{
                    width: scale(40),
                    height: scale(40),
                    borderRadius: scale(20),
                    backgroundColor: input.trim() && !isLoading ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.06)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name="send"
                    size={scale(18)}
                    color={input.trim() && !isLoading ? '#FFFFFF' : 'rgba(255,255,255,0.2)'}
                  />
                </TouchableOpacity>
              </View>
          </SafeAreaView>

          {/* Template Selector Overlay */}
          {showTemplates && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{
          width: '85%',
          maxHeight: '70%',
          backgroundColor: 'rgba(20, 16, 40, 0.95)',
          borderRadius: scale(20),
          padding: scale(16),
          borderWidth: scale(2),
          borderColor: 'rgba(139,92,246,0.3)',
        }}>
          <Text style={{ fontSize: scale(16), fontWeight: '800', color: '#E8DEFF', textAlign: 'center', marginBottom: scale(14) }}>
            Rules Templates
          </Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: scale(300) }}>
            {templates.length === 0 ? (
              <Text style={{ fontSize: scale(12), color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingVertical: scale(20) }}>
                No templates yet
              </Text>
            ) : (
              templates.map(t => (
                <View key={t.id} style={{
                  marginBottom: scale(8),
                  borderRadius: scale(12),
                  backgroundColor: activeTemplate?.id === t.id ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                  borderWidth: scale(1),
                  borderColor: activeTemplate?.id === t.id ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)',
                  overflow: 'hidden',
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: scale(12), paddingVertical: scale(10) }}>
                    <TouchableOpacity onPress={() => handleSelectTemplate(t)} style={{ flex: 1 }}>
                      <Text style={{ fontSize: scale(14), fontWeight: '700', color: '#E8DEFF' }}>{t.name}</Text>
                      <Text style={{ fontSize: scale(10), color: 'rgba(200,180,255,0.4)', marginTop: scale(2) }} numberOfLines={2}>
                        {t.prompt}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleEditTemplate(t)} style={{ padding: scale(6) }}>
                      <Ionicons name="pencil-outline" size={scale(16)} color="rgba(200,180,255,0.5)" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteTemplate(t)} style={{ padding: scale(6) }}>
                      <Ionicons name="trash-outline" size={scale(16)} color="rgba(239,68,68,0.6)" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Add new template button */}
          <TouchableOpacity
            onPress={() => { setShowTemplates(false); setEditingTemplateId(null); setNewTemplateName(''); setNewTemplatePrompt(''); setShowNewTemplate(true); }}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingVertical: scale(10), marginTop: scale(8),
              borderRadius: scale(10), borderWidth: scale(1),
              borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed', gap: scale(6),
            }}
          >
            <Ionicons name="add-circle-outline" size={scale(16)} color="rgba(200,180,255,0.5)" />
            <Text style={{ fontSize: scale(12), fontWeight: '600', color: 'rgba(200,180,255,0.5)' }}>New Template</Text>
          </TouchableOpacity>

          {/* Close */}
          <TouchableOpacity onPress={() => setShowTemplates(false)} style={{ alignItems: 'center', paddingVertical: scale(10), marginTop: scale(6) }}>
            <Text style={{ fontSize: scale(12), fontWeight: '600', color: 'rgba(255,255,255,0.3)' }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
          )}

          {/* New Template Overlay */}
          {showNewTemplate && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{
          width: '88%',
          backgroundColor: 'rgba(20, 16, 40, 0.95)',
          borderRadius: scale(20),
          padding: scale(16),
          borderWidth: scale(2),
          borderColor: 'rgba(139,92,246,0.3)',
        }}>
          <Text style={{ fontSize: scale(16), fontWeight: '800', color: '#E8DEFF', textAlign: 'center', marginBottom: scale(14) }}>
            {editingTemplateId ? 'Edit Template' : 'New Template'}
          </Text>

          {/* Name */}
          <TextInput
            value={newTemplateName}
            onChangeText={setNewTemplateName}
            placeholder="Template name"
            placeholderTextColor="rgba(200,180,255,0.3)"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: scale(12),
              paddingHorizontal: scale(14), paddingVertical: scale(10),
              fontSize: scale(14), color: 'rgba(255,255,255,0.9)',
              borderWidth: scale(1), borderColor: 'rgba(139,92,246,0.15)',
              marginBottom: scale(10),
            }}
          />

          {/* Prompt */}
          <TextInput
            value={newTemplatePrompt}
            onChangeText={setNewTemplatePrompt}
            placeholder="Write your rules here..."
            placeholderTextColor="rgba(200,180,255,0.3)"
            multiline
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: scale(12),
              paddingHorizontal: scale(14), paddingVertical: scale(10),
              fontSize: scale(13), color: 'rgba(255,255,255,0.9)',
              borderWidth: scale(1), borderColor: 'rgba(139,92,246,0.15)',
              marginBottom: scale(14),
              minHeight: scale(120), textAlignVertical: 'top',
            }}
          />

          <View style={{ flexDirection: 'row', gap: scale(10) }}>
            <TouchableOpacity
              onPress={() => { setShowNewTemplate(false); setNewTemplateName(''); setNewTemplatePrompt(''); setEditingTemplateId(null); }}
              style={{
                flex: 1, paddingVertical: scale(11), borderRadius: scale(10),
                backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: scale(13), fontWeight: '600', color: 'rgba(255,255,255,0.4)' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCreateTemplate}
              style={{
                flex: 1, paddingVertical: scale(11), borderRadius: scale(10),
                backgroundColor: 'rgba(139,92,246,0.5)', alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: scale(13), fontWeight: '700', color: '#FFFFFF' }}>{editingTemplateId ? 'Update' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
          )}

        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
}
