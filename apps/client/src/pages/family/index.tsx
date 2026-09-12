import { View, Text, Image, Input, Button } from '@tarojs/components'
import Taro, { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useBabyStore } from '../../stores/babyStore'
import { familyApi } from '../../utils/request'
import familyIllustration from '../../assets/family-illustration.jpg'
import personPinkIcon from '../../assets/icons/person-pink.svg'
import logoutWhiteIcon from '../../assets/icons/logout-white.svg'
import './index.scss'

definePageConfig({
  navigationStyle: 'custom',
  backgroundColor: '#FEF8F7',
})

interface Member {
  id: string
  userId: string
  babyId: string
  role: string
  status: string
  /** 本家庭内的备注名（家庭昵称），未设置时为 null，前端回落到微信昵称 */
  nickname?: string | null
  user?: {
    id: string
    nickname?: string
    avatar?: string
    role?: string
  }
}

interface InviteInfo {
  inviteCode: string
  expiresAt: string
}

const ROLE_MAP: Record<string, string> = {
  father: '爸爸',
  mother: '妈妈',
  grandfather: '爷爷',
  grandmother: '奶奶',
  other: '家人',
  owner: '创建者',
}

export default function FamilyPage() {
  const { userInfo } = useAuthStore()
  const { fetchBabies } = useBabyStore()
  const [members, setMembers] = useState<Member[]>([])
  const [isBound, setIsBound] = useState(false)
  const [isOwner, setIsOwner] = useState(false)

  // Invite & Join state
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [inputInviteCode, setInputInviteCode] = useState('')

  // 成员操作弹层 / 修改昵称弹层
  const [actionMember, setActionMember] = useState<Member | null>(null)
  const [renameMember, setRenameMember] = useState<Member | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [savingRename, setSavingRename] = useState(false)

  // 自定义导航：返回按钮与微信胶囊同带对称
  const [menuBand] = useState(() => {
    let top = (Taro.getSystemInfoSync().statusBarHeight || 20) + 4
    let height = 32
    let leftInset = 10
    try {
      const menu = Taro.getMenuButtonBoundingClientRect()
      if (menu && menu.height) {
        const si = Taro.getSystemInfoSync()
        top = menu.top
        height = menu.height
        leftInset = Math.max(6, si.windowWidth - menu.right)
      }
    } catch (error) {
      // 取不到胶囊信息时用默认值
    }
    return { top, height, leftInset }
  })

  const handleBack = () => {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) {
      Taro.navigateBack();
    } else {
      Taro.switchTab({ url: '/pages/mine/index' });
    }
  }

  useDidShow(() => {
    init()
  })

  // 列表展示名：优先本家庭备注名，其次微信昵称
  const getDisplayName = (member: Member) =>
    member.nickname || member.user?.nickname || '未知用户'

  const isSelf = (member: Member) => member.userId === userInfo?.id

  // 备注名是给「别人」看的：只能由创建者改其他成员，谁都不能改自己
  // （自己的名字去「我的」页改，那是全局昵称）
  const canRename = (member: Member) => isOwner && !isSelf(member)

  // 创建者可移除除自己以外的成员
  const canRemove = (member: Member) => isOwner && !isSelf(member)

  const init = async () => {
    await fetchBabies()
    await loadData()
  }

  const loadData = async () => {
    try {
      const [membersRes, bindingRes] = await Promise.all([
        familyApi.getMembers(),
        familyApi.getBindingStatus(),
      ])
      setMembers(membersRes.data || [])
      const bound = bindingRes.data?.isBound ?? false
      const reason = bindingRes.data?.reason
      setIsBound(bound)
      // 未绑定说明没有家庭成员，自己就是创建者；已绑定且 reason 是 owner 也是创建者
      const owner = !bound || reason === 'owner'
      setIsOwner(owner)
      // 创建者自动准备邀请卡（分享按钮即点即用）
      if (owner) {
        prepareInvite()
      }
    } catch (error) {
      console.error('加载家庭数据失败', error)
    }
  }

  // 生成/复用邀请卡（force=true 时作废旧卡重新生成）
  const prepareInvite = async (force = false) => {
    const { currentBaby: baby, babies: list } = useBabyStore.getState()
    const target = baby || list[0]
    if (!target) return
    try {
      const res = await familyApi.createInvite(target.id, force)
      setInviteInfo({
        inviteCode: res.data.inviteCode,
        expiresAt: res.data.expiresAt,
      })
    } catch (error) {
      if (force) {
        Taro.showToast({ title: '生成失败，请重试', icon: 'none' })
      }
    }
  }

  // 分享卡片（转发不断链：落地页可继续转发）。
  // 标题用通用「家人」视角说清点开能得到什么，不特指某类家人
  useShareAppMessage(() => {
    const { currentBaby: baby, babies: list } = useBabyStore.getState()
    const babyName = baby?.name || list[0]?.name || '宝宝'
    return {
      title: `${babyName}的日常都在这里，家人点开就能看`,
      path: `/pages/family-join/index?invite=${inviteInfo?.inviteCode || ''}`,
    }
  })

  const closeSheets = () => {
    setActionMember(null)
    setRenameMember(null)
  }

  const handleDeleteMember = async (member: Member) => {
    const name = getDisplayName(member)
    const res = await Taro.showModal({
      title: '移除成员',
      content: `确定要移除 ${name} 吗？移除后 TA 将无法查看宝宝的记录。`,
    })
    if (res.confirm) {
      try {
        await familyApi.removeMember(member.id)
        Taro.showToast({ title: '已移除', icon: 'success' })
        loadData()
      } catch (error) {
        // 错误提示由全局拦截器统一 toast
      }
    }
  }

  // 点成员卡片：弹出操作层（无可用操作时不响应）
  const handleMemberTap = (member: Member) => {
    if (canRename(member) || canRemove(member)) {
      setActionMember(member)
    }
  }

  const handleOpenRename = () => {
    if (!actionMember) return
    setRenameMember(actionMember)
    setRenameValue(actionMember.nickname || '')
    setActionMember(null)
  }

  // 保存备注名：空串 = 恢复默认（回落到微信昵称）
  const handleSaveRename = async () => {
    if (!renameMember || savingRename) return
    const next = renameValue.trim()
    if (next.length > 20) {
      Taro.showToast({ title: '昵称最多 20 个字', icon: 'none' })
      return
    }
    setSavingRename(true)
    try {
      await familyApi.updateMemberNickname(renameMember.userId, next)
      Taro.showToast({
        title: next ? '昵称已更新' : '已恢复默认昵称',
        icon: 'success',
      })
      setRenameMember(null)
      loadData()
    } catch (error) {
      // 失败原因（含内容安全拦截）由全局拦截器统一 toast
    } finally {
      setSavingRename(false)
    }
  }

  const handleCopyInviteCode = () => {
    if (!inviteInfo) return
    Taro.setClipboardData({
      data: inviteInfo.inviteCode,
      success: () => {
        Taro.showToast({ title: '已复制', icon: 'success' })
      },
    })
  }

  const handleRegenerate = async () => {
    const res = await Taro.showModal({
      title: '重新生成邀请卡',
      content: '旧邀请卡将立即失效，已分享出去的卡片无法再加入，确定重新生成吗？',
      confirmText: '重新生成',
    })
    if (res.confirm) {
      prepareInvite(true)
    }
  }

  const handleAcceptInvite = async () => {
    if (!inputInviteCode.trim()) {
      Taro.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    try {
      await familyApi.acceptInvite(inputInviteCode.trim())
      Taro.showToast({ title: '加入成功', icon: 'success' })
      setInputInviteCode('')
      loadData()
    } catch (error) {
      Taro.showToast({ title: '邀请码无效或已绑定家庭', icon: 'none' })
    }
  }

  const handleLeaveFamily = async () => {
    const res = await Taro.showModal({
      title: '退出家庭',
      content: '退出后将无法查看该家庭的宝贝信息，确定要退出吗？',
      confirmText: '确定退出',
      confirmColor: '#FF8A8A',
    })
    if (res.confirm) {
      try {
        await familyApi.leaveFamily()
        Taro.showToast({ title: '已退出家庭', icon: 'success' })
        loadData()
      } catch (error) {
        // 错误提示由全局拦截器统一 toast
      }
    }
  }

  const getRoleText = (role?: string) => ROLE_MAP[role || ''] || '家人'

  const formatExpiry = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }

  return (
    <View className="family-page">
      {/* 返回按钮：与微信胶囊同带对称、fixed 不随滚动 */}
      <View
        className="family-back"
        style={{
          top: `${menuBand.top}px`,
          left: `${menuBand.leftInset}px`,
          width: `${menuBand.height}px`,
          height: `${menuBand.height}px`,
        }}
        onClick={handleBack}
      >
        <Text className="family-back-icon">‹</Text>
      </View>

      {/* 导航行：居中标题（高度=胶囊高度，与胶囊垂直居中） */}
      <View
        className="family-navbar"
        style={{
          paddingTop: `${menuBand.top}px`,
          height: `${menuBand.height}px`,
          marginBottom: '14px',
        }}
      >
        <Text className="family-navbar-title">家庭成员</Text>
      </View>

      {/* 头部：大标题 + 副标题 + 插画 */}
      <View className="family-hero">
        <View className="family-hero-copy">
          <Text className="family-hero-title">家庭成员</Text>
          <Text className="family-hero-desc">管理家庭成员，守护家人健康</Text>
        </View>
        <Image
          className="family-hero-illustration"
          src={familyIllustration}
          mode="aspectFit"
        />
      </View>

      {/* 成员列表 */}
      {members.length === 0 ? (
        <View className="family-card members-empty">
          <Text className="members-empty-text">暂无其他成员</Text>
          <Text className="members-empty-desc">分享邀请卡给家人，一起看宝宝长大</Text>
        </View>
      ) : (
        <View className="family-members">
          {members.map(member => (
            <View
              key={member.id}
              className="family-card member-card"
              onClick={() => handleMemberTap(member)}
            >
              <View className="member-avatar">
                {member.user?.avatar ? (
                  <Image className="member-avatar-img" src={member.user.avatar} mode="aspectFill" />
                ) : (
                  <Image className="member-avatar-icon" src={personPinkIcon} />
                )}
              </View>
              <View className="member-info">
                <View className="member-name-row">
                  <Text className="member-name">{getDisplayName(member)}</Text>
                  {member.nickname ? (
                    <Text className="member-name-badge">备注</Text>
                  ) : null}
                </View>
                <View className="member-role-pill">
                  <Text className="member-role-pill-text">
                    {getRoleText(member.user?.role || member.role)}
                  </Text>
                </View>
              </View>
              {(canRename(member) || canRemove(member)) && (
                <Text className="member-arrow">›</Text>
              )}
            </View>
          ))}
          {members.some(m => canRename(m) || canRemove(m)) && (
            <Text className="members-tip">点击其他成员可修改昵称，备注仅本家庭可见</Text>
          )}
        </View>
      )}

      {/* 邀请家人 - only for owner */}
      {isOwner && (
        <View className="family-card invite-card">
          <View className="edit-label-row">
            <View className="edit-label-dot" />
            <Text className="edit-label">邀请家人</Text>
          </View>
          {inviteInfo ? (
            <View className="invite-panel">
              <View className="invite-code-box">
                <Text className="invite-code-text">{inviteInfo.inviteCode}</Text>
                <View className="invite-copy-btn" onClick={handleCopyInviteCode}>
                  <Text>复制</Text>
                </View>
              </View>
              <Text className="invite-expiry">
                有效期至 {formatExpiry(inviteInfo.expiresAt)}，卡片可分享给多位家人
              </Text>
              <Button className="invite-share-btn" openType="share">
                <Text className="invite-share-btn-text">微信分享邀请卡</Text>
              </Button>
              <View className="invite-regen" onClick={handleRegenerate}>
                <Text className="invite-regen-text">重新生成（旧卡立即失效）</Text>
              </View>
            </View>
          ) : (
            <View className="invite-generate-btn" onClick={() => prepareInvite()}>
              <Text>生成邀请卡</Text>
            </View>
          )}
        </View>
      )}

      {/* Join family - hidden if already bound */}
      {!isBound && (
        <View className="family-card invite-card">
          <View className="edit-label-row">
            <View className="edit-label-dot" />
            <Text className="edit-label">输入邀请码加入</Text>
          </View>
          <View className="invite-input-row">
            <Input
              className="invite-input"
              value={inputInviteCode}
              onInput={e => setInputInviteCode(e.detail.value)}
              placeholder="请输入邀请码"
              maxlength={8}
            />
            <View className="invite-join-btn" onClick={handleAcceptInvite}>
              <Text>加入</Text>
            </View>
          </View>
        </View>
      )}

      {/* 退出家庭 - only for members */}
      {!isOwner && isBound && (
        <View className="leave-family-btn" onClick={handleLeaveFamily}>
          <Image className="leave-family-icon" src={logoutWhiteIcon} />
          <Text className="leave-family-text">退出家庭</Text>
        </View>
      )}

      {/* 成员操作弹层 */}
      {actionMember && (
        <View className="sheet-overlay" onClick={closeSheets}>
          <View className="sheet-panel" onClick={e => e.stopPropagation()}>
            <View className="sheet-handle" />
            <View className="sheet-header">
              <Text className="sheet-title">{getDisplayName(actionMember)}</Text>
              {actionMember.nickname ? (
                <Text className="sheet-subtitle">
                  微信昵称：{actionMember.user?.nickname || '未设置'}
                </Text>
              ) : null}
            </View>
            <View className="sheet-body">
              {canRename(actionMember) && (
                <View className="member-action" onClick={handleOpenRename}>
                  <Text className="member-action-text">修改昵称</Text>
                </View>
              )}
              {canRemove(actionMember) && (
                <View
                  className="member-action"
                  onClick={() => {
                    const target = actionMember
                    setActionMember(null)
                    handleDeleteMember(target)
                  }}
                >
                  <Text className="member-action-text member-action-danger">
                    移除成员
                  </Text>
                </View>
              )}
              <View className="sheet-actions">
                <View className="sheet-btn sheet-btn-cancel" onClick={closeSheets}>
                  <Text>取消</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 修改昵称弹层 */}
      {renameMember && (
        <View className="sheet-overlay" onClick={() => setRenameMember(null)}>
          <View className="sheet-panel" onClick={e => e.stopPropagation()}>
            <View className="sheet-handle" />
            <View className="sheet-header">
              <Text className="sheet-title">修改昵称</Text>
              <Text className="sheet-subtitle">备注仅本家庭可见，方便辨认</Text>
            </View>
            <View className="sheet-body">
              <View className="rename-field">
                <Input
                  className="rename-input"
                  value={renameValue}
                  onInput={e => setRenameValue(e.detail.value)}
                  placeholder={renameMember.user?.nickname || '请输入昵称'}
                  maxlength={20}
                  focus
                />
                <Text className="rename-count">{renameValue.length}/20</Text>
              </View>
              {renameMember.nickname ? (
                <View
                  className="rename-restore"
                  onClick={() => setRenameValue('')}
                >
                  <Text className="rename-restore-text">
                    恢复默认（使用微信昵称）
                  </Text>
                </View>
              ) : null}
              <View className="sheet-actions">
                <View
                  className="sheet-btn sheet-btn-cancel"
                  onClick={() => setRenameMember(null)}
                >
                  <Text>取消</Text>
                </View>
                <View
                  className={`sheet-btn sheet-btn-confirm${savingRename ? ' is-disabled' : ''}`}
                  onClick={handleSaveRename}
                >
                  <Text>{savingRename ? '保存中…' : '保存'}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
